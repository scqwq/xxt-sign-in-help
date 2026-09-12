import { AlertColor } from '@mui/material';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import { useEffect, useState } from 'react';
import { getPanPhoto, manualPhotoSign, manualSign, saveCourse, signWithPanPhoto } from './Helper';
import MapPicker from './MapPicker';

interface RightPanelProps {
  phone: string;
  monitorEvents: any[];
  onAlert: (msg: string, severity: AlertColor) => void;
  onCourseRecorded: () => void;
}

const signTypeText = (otherId: number, ifphoto?: number): string => {
  if (ifphoto === 1 || otherId === 0 && ifphoto === 1) return '拍照签到';
  switch (otherId) {
    case 0: return '普通/拍照签到';
    case 2: return '二维码签到';
    case 3: return '手势签到';
    case 4: return '位置签到';
    case 5: return '签到码签到';
    default: return '未知签到';
  }
};

function loadSuccessAutoHide(): number {
  try {
    const raw = localStorage.getItem('map_settings');
    if (raw) return JSON.parse(raw).successAutoHide ?? 30;
  } catch { /* ignore */ }
  return 30;
}

export default function RightPanel({ phone, monitorEvents, onAlert, onCourseRecorded }: RightPanelProps) {
  const [busy, setBusy] = useState<{ [activeId: string]: boolean }>({});
  const [expanded, setExpanded] = useState<{ [activeId: string]: boolean }>({});
  const [locationInput, setLocationInput] = useState<{ [activeId: string]: { latlon: string; address: string } }>({});
  const [signCodeInput, setSignCodeInput] = useState<{ [activeId: string]: string }>({});
  const [mapPickerFor, setMapPickerFor] = useState<string | null>(null);
  // 手动签到结果（覆盖后端事件状态）
  const [manualResults, setManualResults] = useState<{ [key: string]: { success: boolean; resultText: string } }>({});
  // 自动隐藏的 activeId 集合
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const setManualResult = (activeId: string, success: boolean, resultText: string) => {
    setManualResults(prev => ({ ...prev, [activeId]: { success, resultText } }));
    if (success) {
      const autoHide = loadSuccessAutoHide();
      if (autoHide > 0) {
        setTimeout(() => {
          setHiddenIds(prev => new Set([...prev, activeId]));
        }, autoHide * 1000);
      }
    }
  };

  const groupedEvents = () => {
    const map = new Map<string, any>();
    for (const ev of monitorEvents) {
      const key = String(ev.activeId);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { detected: null, processing: null, result: null, raw: ev });
      }
      const entry = map.get(key)!;
      if (ev.type === 'detected') entry.detected = ev;
      else if (ev.type === 'processing') entry.processing = ev;
      else if (ev.type === 'result') entry.result = ev;
      if (ev.time > entry.raw.time) entry.raw = ev;
    }
    return Array.from(map.values()).sort((a, b) => b.raw.time - a.raw.time);
  };

  const handleManualSign = async (ev: any) => {
    const activeId = ev.activeId;
    const otherId = ev.otherId;
    const ifphoto = ev.ifphoto;
    setBusy(prev => ({ ...prev, [activeId]: true }));
    try {
      let res: any;
      if (ifphoto === 1) {
        setExpanded(prev => ({ ...prev, [activeId]: true }));
        setBusy(prev => ({ ...prev, [activeId]: false }));
        return;
      }
      if (otherId === 4) {
        setExpanded(prev => ({ ...prev, [activeId]: true }));
        setBusy(prev => ({ ...prev, [activeId]: false }));
        return;
      }
      if (otherId === 5) {
        setExpanded(prev => ({ ...prev, [activeId]: true }));
        setBusy(prev => ({ ...prev, [activeId]: false }));
        return;
      }
      res = await manualSign(phone, {
        activeId: Number(activeId),
        otherId,
        courseId: ev.courseId,
        classId: ev.classId,
        signType: signTypeText(otherId, ifphoto)
      });
      const msg = res?.msg || (res?.success ? '签到成功' : '签到失败');
      onAlert(msg, res?.success ? 'success' : 'error');
      setManualResult(String(activeId), res?.success, msg);
    } catch (err: any) {
      onAlert(err?.message || '签到请求失败', 'error');
      setManualResult(String(activeId), false, err?.message || '签到请求失败');
    } finally {
      setBusy(prev => ({ ...prev, [activeId]: false }));
    }
  };

  const handlePhotoSign = async (ev: any, file: File) => {
    const activeId = ev.activeId;
    setBusy(prev => ({ ...prev, [activeId]: true }));
    try {
      const res = await manualPhotoSign(phone, {
        activeId: Number(activeId),
        otherId: ev.otherId,
        courseId: ev.courseId,
        classId: ev.classId,
        signType: '拍照签到'
      }, file);
      const msg = res?.msg || (res?.success ? '拍照签到成功' : '拍照签到失败');
      onAlert(msg, res?.success ? 'success' : 'error');
      setManualResult(String(activeId), res?.success, msg);
      if (res?.success) setExpanded(prev => ({ ...prev, [activeId]: false }));
    } catch (err: any) {
      onAlert(err?.message || '拍照签到请求失败', 'error');
      setManualResult(String(activeId), false, err?.message || '拍照签到请求失败');
    } finally {
      setBusy(prev => ({ ...prev, [activeId]: false }));
    }
  };

  const handleLocationSign = async (ev: any) => {
    const activeId = ev.activeId;
    const input = locationInput[activeId] || { latlon: '', address: '' };
    if (!input.latlon || !input.address) {
      onAlert('请填写经纬度和地址', 'warning');
      return;
    }
    const [lat, lon] = input.latlon.split(',');
    setBusy(prev => ({ ...prev, [activeId]: true }));
    try {
      const res = await manualSign(phone, {
        activeId: Number(activeId),
        otherId: 4,
        courseId: ev.courseId,
        classId: ev.classId,
        signType: '位置签到',
        lat: lat?.trim(),
        lon: lon?.trim(),
        address: input.address
      });
      const msg = res?.msg || (res?.success ? '位置签到成功' : '位置签到失败');
      onAlert(msg, res?.success ? 'success' : 'error');
      setManualResult(String(activeId), res?.success, msg);
      if (res?.success) setExpanded(prev => ({ ...prev, [activeId]: false }));
    } catch (err: any) {
      onAlert(err?.message || '位置签到请求失败', 'error');
      setManualResult(String(activeId), false, err?.message || '位置签到请求失败');
    } finally {
      setBusy(prev => ({ ...prev, [activeId]: false }));
    }
  };

  const handleSignCodeSign = async (ev: any) => {
    const activeId = ev.activeId;
    const code = signCodeInput[activeId] || '';
    if (!code) {
      onAlert('请输入签到码', 'warning');
      return;
    }
    setBusy(prev => ({ ...prev, [activeId]: true }));
    try {
      const res = await manualSign(phone, {
        activeId: Number(activeId),
        otherId: 5,
        courseId: ev.courseId,
        classId: ev.classId,
        signType: '签到码签到',
        signCode: code
      });
      const msg = res?.msg || (res?.success ? '签到成功' : '签到失败');
      onAlert(msg, res?.success ? 'success' : 'error');
      setManualResult(String(activeId), res?.success, msg);
      if (res?.success) setExpanded(prev => ({ ...prev, [activeId]: false }));
    } catch (err: any) {
      onAlert(err?.message || '签到请求失败', 'error');
      setManualResult(String(activeId), false, err?.message || '签到请求失败');
    } finally {
      setBusy(prev => ({ ...prev, [activeId]: false }));
    }
  };

  const handleRecordCourse = async (ev: any) => {
    try {
      await saveCourse(phone, {
        courseId: String(ev.courseId),
        courseName: ev.courseName || String(ev.courseId),
        autoSign: false,
        photoPath: ''
      });
      onAlert('已记录课程：' + (ev.courseName || ev.courseId), 'success');
      onCourseRecorded();
    } catch (err: any) {
      onAlert(err?.message || '记录课程失败', 'error');
    }
  };

  const handlePanPhotoSign = async (ev: any) => {
    const activeId = ev.activeId;
    setBusy(prev => ({ ...prev, [activeId]: true }));
    try {
      const panRes = await getPanPhoto(phone);
      if (!panRes?.success || !panRes?.objectId) {
        onAlert(panRes?.msg || '云盘中未找到 0.jpg/0.png，请先在左侧上传图片到云盘', 'warning');
        setBusy(prev => ({ ...prev, [activeId]: false }));
        return;
      }
      const res = await signWithPanPhoto(phone, {
        activeId: Number(activeId),
        otherId: 0,
        courseId: ev.courseId,
        classId: ev.classId,
        signType: '拍照签到',
        objectId: panRes.objectId
      });
      const msg = res?.msg || (res?.success ? '云盘图片签到成功' : '云盘图片签到失败');
      onAlert(msg, res?.success ? 'success' : 'error');
      setManualResult(String(activeId), res?.success, msg);
      if (res?.success) setExpanded(prev => ({ ...prev, [activeId]: false }));
    } catch (err: any) {
      onAlert(err?.message || '云盘图片签到失败', 'error');
      setManualResult(String(activeId), false, err?.message || '云盘图片签到失败');
    } finally {
      setBusy(prev => ({ ...prev, [activeId]: false }));
    }
  };

  const events = groupedEvents();

  return (
    <div className='dashboard-right'>
      <div className='panel'>
        <h3>签到任务</h3>
        <span className='muted'>自动每 5 秒刷新，检测到的新签到会出现在这里</span>
        <div className='sign-feed' style={{ marginTop: 12 }}>
          {events.length === 0 && <div className='empty-feed'>暂未检测到签到活动，请在左侧开启监听</div>}
          {events.map((entry) => {
            const ev = entry.detected || entry.raw;
            const activeId = String(ev.activeId);
            if (hiddenIds.has(activeId)) return null;
            const manualResult = manualResults[activeId];
            const hasResult = !!entry.result || !!manualResult;
            const resultText = manualResult?.resultText || entry.result?.result || '';
            const isSuccess = manualResult ? manualResult.success : resultText.includes('成功');
            const isAutoSigned = ev.autoSign === true;
            const isBusy = busy[activeId];
            const isExpanded = expanded[activeId];

            return (
              <div className='sign-event' key={activeId}>
                <div className='sign-event-left'>
                  <strong>{ev.courseName || ev.courseId || '未知课程'}</strong>
                  <span className='muted'>
                    {signTypeText(ev.otherId, ev.ifphoto)} · 活动 {ev.activeId}
                  </span>
                  {hasResult && (
                    <span className='muted' style={{ color: isSuccess ? '#16a34a' : '#dc2626', marginTop: 4, display: 'block', fontWeight: 500 }}>
                      {resultText}
                    </span>
                  )}
                  {!isAutoSigned && !hasResult && (
                    <div className='sign-event-actions'>
                      <Button
                        size='small'
                        variant='contained'
                        disabled={isBusy}
                        onClick={() => handleManualSign(ev)}
                        style={{ borderRadius: 8 }}
                      >
                        {isBusy ? <CircularProgress size={14} /> : '手动签到'}
                      </Button>
                      <Button
                        size='small'
                        variant='outlined'
                        onClick={() => handleRecordCourse(ev)}
                        style={{ borderRadius: 8 }}
                      >
                        记录课程
                      </Button>
                    </div>
                  )}
                  {hasResult && !isSuccess && (
                    <div className='sign-event-actions'>
                      <Button
                        size='small'
                        variant='contained'
                        disabled={isBusy}
                        onClick={() => handleManualSign(ev)}
                        style={{ borderRadius: 8 }}
                      >
                        {isBusy ? <CircularProgress size={14} /> : '再次签到'}
                      </Button>
                    </div>
                  )}
                  {isExpanded && ev.ifphoto === 1 && (
                    <div className='manual-sign-form'>
                      <input
                        type='file'
                        accept='image/*'
                        id={'photo-input-' + activeId}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoSign(ev, file);
                        }}
                      />
                      <Button
                        size='small'
                        variant='outlined'
                        fullWidth
                        disabled={isBusy}
                        onClick={() => document.getElementById('photo-input-' + activeId)?.click()}
                        style={{ borderRadius: 8, marginBottom: 6 }}
                      >
                        {isBusy ? <CircularProgress size={14} /> : '选择本地图片签到'}
                      </Button>
                      <Button
                        size='small'
                        variant='outlined'
                        fullWidth
                        disabled={isBusy}
                        onClick={() => handlePanPhotoSign(ev)}
                        style={{ borderRadius: 8 }}
                      >
                        使用云盘图片签到
                      </Button>
                    </div>
                  )}
                  {isExpanded && ev.otherId === 4 && (
                    <div className='manual-sign-form'>
                      <Button
                        size='small'
                        variant='outlined'
                        fullWidth
                        onClick={() => setMapPickerFor(activeId)}
                        style={{ borderRadius: 8, marginBottom: 6 }}
                      >
                        📍 点击地图选择位置
                      </Button>
                      <input
                        className='input-area'
                        placeholder='经纬度，例: 116.417492,39.920912'
                        value={locationInput[activeId]?.latlon || ''}
                        onChange={(e) => setLocationInput(prev => ({ ...prev, [activeId]: { ...prev[activeId], latlon: e.target.value } }))}
                      />
                      <input
                        className='input-area'
                        placeholder='地址，例: 河南省郑州市xx大学'
                        value={locationInput[activeId]?.address || ''}
                        onChange={(e) => setLocationInput(prev => ({ ...prev, [activeId]: { ...prev[activeId], address: e.target.value } }))}
                      />
                      <Button size='small' variant='contained' fullWidth disabled={isBusy} onClick={() => handleLocationSign(ev)} style={{ borderRadius: 8 }}>
                        {isBusy ? <CircularProgress size={14} /> : '位置签到'}
                      </Button>
                    </div>
                  )}
                  {isExpanded && ev.otherId === 5 && (
                    <div className='manual-sign-form'>
                      <input
                        className='input-area'
                        placeholder='请输入签到码'
                        value={signCodeInput[activeId] || ''}
                        onChange={(e) => setSignCodeInput(prev => ({ ...prev, [activeId]: e.target.value }))}
                      />
                      <Button size='small' variant='contained' fullWidth disabled={isBusy} onClick={() => handleSignCodeSign(ev)} style={{ borderRadius: 8 }}>
                        {isBusy ? <CircularProgress size={14} /> : '签到'}
                      </Button>
                    </div>
                  )}
                </div>
                <div className='sign-event-right'>
                  {hasResult ? (
                    <span className={'result-text ' + (isSuccess ? '' : 'error')}>{isSuccess ? '✅' : '❌'}</span>
                  ) : isAutoSigned ? (
                    <span className='result-text'>自动</span>
                  ) : (
                    <span className='muted'>待操作</span>
                  )}
                  <small>{new Date(ev.time).toLocaleTimeString()}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {mapPickerFor && (
        <MapPicker
          onClose={() => setMapPickerFor(null)}
          onConfirm={(lat, lon, address) => {
            setLocationInput(prev => ({
              ...prev,
              [mapPickerFor]: { latlon: lat + ',' + lon, address }
            }));
            setMapPickerFor(null);
          }}
        />
      )}
    </div>
  );
}
