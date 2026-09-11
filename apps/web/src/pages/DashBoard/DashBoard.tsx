import { AlertColor } from '@mui/material';
import Alert from '@mui/material/Alert';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import { fetch as Fetch } from '../../utils/request';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import RefreshIcon from '@mui/icons-material/Refresh';
import IconButton from '@mui/material/IconButton';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { activity_api, login_api, monitor_events_api, monitor_start_api, monitor_status_api, monitor_stop_api } from '../../config/api';
import './DashBoard.css';
import { generalSign, getuvToken, locationSign, parseEnc, photoSign, qrcodeSign, showResultWithTransition, uploadFile } from './Helper';

interface SignInfo {
  activity: Activity;
  status: string;
}
interface Activity {
  name: string;
  activeId?: number;
  courseId?: string | number;
  classId?: string | number;
  otherId?: string | number;
}
interface AlertInfo {
  msg: string;
  show: boolean;
  severity: AlertColor;
}

function DashBoard() {
  const params = useParams();
  const [userParams, setUserParams] = useState<UserParamsType>({} as UserParamsType);
  const [sign, setSign] = useState<SignInfo>({
    activity: {
      name: ''
    },
    status: ''
  });
  const [progress, setProgress] = useState(false);
  const [btnProgress, setBtnProgress] = useState(false);
  const [scanProgress, setScanProgress] = useState(false);
  const [radio, setRadio] = useState(0);
  const [values, setValues] = useState<{ [index: string]: string | File; }>({});
  const [alert, setAlert] = useState<AlertInfo>({ msg: '', show: false, severity: 'info' });
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorEvents, setMonitorEvents] = useState<any[]>([]);
  const [monitorOnline, setMonitorOnline] = useState(false);

  const [control, setControl] = useState({
    start: {
      show: true
    }
  });

  const refreshMonitor = async () => {
    if (!params.phone) return;
    const [status, events] = await Promise.all([
      Fetch(`${monitor_status_api}/${params.phone}`),
      Fetch(`${monitor_events_api}/${params.phone}`)
    ]);
    setMonitorOnline(status?.code === 200);
    setMonitorEvents(events?.events || []);
  };

  const toggleAccountMonitor = async () => {
    if (!userParams.phone || monitorLoading) return;
    setMonitorLoading(true);
    try {
      const isRunning = monitorOnline;
      const payload = isRunning ? undefined : btoa(unescape(encodeURIComponent(JSON.stringify({
        credentials: { phone: userParams.phone, uf: userParams.uf, _d: userParams._d, vc3: userParams.vc3,
          uid: userParams._uid, lv: userParams.lv, fid: userParams.fid },
        config: userParams.config
      }))));
      const result = await Fetch(`${isRunning ? monitor_stop_api : monitor_start_api}/${userParams.phone}`, {
        method: 'POST', body: isRunning ? undefined : { payload }
      });
      if (result?.code === 200 || result?.code === 201) {
        setMonitorOnline(result.code === 200);
        setAlert({ msg: result.code === 200 ? '已开启签到监听' : '已停止签到监听', show: true, severity: 'success' });
      } else {
        setAlert({ msg: result?.msg || '监听状态更新失败', show: true, severity: 'error' });
      }
      await refreshMonitor();
    } catch (error) {
      console.error(error);
      setAlert({ msg: '无法连接签到监听服务，请确认后端已启动', show: true, severity: 'error' });
    } finally {
      setMonitorLoading(false);
    }
  };

  const start = async () => {
    // eslint-disable-next-line prefer-const
    let activity: any;
    document.getElementById('start-btn')?.classList.add('hidden');
    setTimeout(() => {
      setControl({ start: { show: false } });
      if (!activity) {
        setProgress(true);
      }
    }, 350);

    activity = await Fetch(activity_api, {
      method: 'POST',
      body: {
        uf: userParams.uf,
        _d: userParams._d,
        vc3: userParams.vc3,
        uid: userParams._uid
      }
    });
    // console.log(activity)
    setProgress(false);
    switch (activity) {
      case 'NoActivity': setSign({ activity: { name: '无签到活动' }, status: '' }); break;
      case 'AuthRequired': setSign({ activity: { name: '需重新登录' }, status: '' }); break;
      case 'NoCourse': setSign({ activity: { name: '无课程' }, status: '' }); break;
      default: setSign({ activity: (activity as Activity), status: '' });
    }
  };

  const handleRadio = (type: 'general' | 'photo') => {
    return function () {
      console.log(type);
      const label_general = document.getElementById('label-general');
      const label_photo = document.getElementById('label-photo');
      switch (type) {
        case 'general': {
          label_general!.className = 'checked';
          label_photo!.className = 'unchecked';
          setRadio(0);
          break;
        }
        case 'photo': {
          label_general!.className = 'unchecked';
          label_photo!.className = 'checked';
          setAlert({ msg: '确保已将照片上传指定位置，点击签到', severity: 'info', show: true });
          setRadio(1);
          break;
        }
        default: break;
      }
    };
  };
  const updateValue = (name: string, value: string | File) => {
    setValues((prev) => {
      const object = { ...prev };
      object[name] = value;
      return object;
    });
  };
  const setStatus = (res: string) => {
    if (res === 'success') {
      setSign((prev) => {
        return {
          activity: prev.activity,
          status: '签到成功'
        };
      });
    } else {
      setSign((prev) => {
        return {
          activity: prev.activity,
          status: res
        };
      });
    }
  };
  const onSign_0 = async () => {
    let res: string;
    if ((document.getElementById('general') as HTMLInputElement)?.checked) {
      res = await generalSign(userParams, sign.activity.activeId);
    } else {
      setBtnProgress(true);
      // 获取uvtoken
      const token = await getuvToken(userParams);
      // 上传文件，获取上传结果
      const result_upload = await uploadFile(userParams, values['photo'] as File, token);
      // console.log(result_upload); // 得到的是JSON字符串
      // 传入objectId进行签到
      res = await photoSign(userParams, sign.activity.activeId, JSON.parse(result_upload).objectId);
      setBtnProgress(false);
    }
    showResultWithTransition(setStatus, res);
  };
  const onSign_2 = async () => {
    const latlon = (values['latlon'] as string).split(','), address = values['address'] as string;
    const res = await qrcodeSign(userParams, sign.activity.activeId, values['enc'] as string, latlon[1],
      latlon[0], address, values['altitude'] as string);
    showResultWithTransition(setStatus, res);
  };
  const setEncByQRCodeImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files![0];
    setScanProgress(true);
    // 对图片文件进行解析获得enc
    const enc = await parseEnc(image);
    values['enc'] = enc;
    const encInput = document.getElementById('input-enc');
    encInput?.setAttribute('value', enc);
    setScanProgress(false);
  };
  const onSign_4 = async () => {
    const latlon = values['latlon'] as string, address = values['address'] as string;
    const res = await locationSign(userParams, sign.activity.activeId, latlon.substring(latlon.indexOf(',') + 1, latlon.length),
      latlon.substring(0, latlon.indexOf(',')), address);
    showResultWithTransition(setStatus, res);
  };
  const onSign_35 = async () => {
    const res = await generalSign(userParams, sign.activity.activeId);
    showResultWithTransition(setStatus, res);
  };

  useEffect(() => {
    const request = indexedDB.open('ui');
    request.onsuccess = () => {
      const db = request.result;
      // 获取用户登录时间
      const request_IDBGET = db.transaction('user', 'readwrite')
        .objectStore('user')
        .get(params.phone as string);
      request_IDBGET.onsuccess = async () => {
        // 数据读取成功
        setUserParams(request_IDBGET.result);
        // 身份过期自动重新登陆
        if (Date.now() - request_IDBGET.result.date > 432000000) {
          const user = await Fetch(login_api, {
            method: 'POST',
            body: {
              phone: request_IDBGET.result.phone,
              password: request_IDBGET.result.password
            }
          });
          if (user === 'AuthFailed') {
            setAlert({ msg: '重新登录失败', show: true, severity: 'error' });
          } else {
            const userParam: UserParamsType = {
              phone: request_IDBGET.result.phone,
              fid: user.fid,
              vc3: user.vc3,
              password: request_IDBGET.result.password,
              _uid: user._uid,
              _d: user._d,
              uf: user.uf,
              name: user.name,
              date: new Date(),
              lv: user.lv,
              monitor: false,
              config: user.config
            };
            setUserParams(userParam);
            // 登陆成功将新信息写入数据库
            db.transaction('user', 'readwrite')
              .objectStore('user').put(userParam)
              .onsuccess = () => {
                setAlert({ msg: '凭证已自动更新', show: true, severity: 'success' });
              };
          }
        }
      };
    };
  }, []);

  useEffect(() => {
    refreshMonitor();
    const timer = window.setInterval(refreshMonitor, 5000);
    return () => window.clearInterval(timer);
  }, [params.phone]);

  return (
    <div className='dashboard-page'>
      <Paper className='monitor-panel' elevation={0}>
        <div className='monitor-heading'>
          <div>
            <p className='eyebrow'>账户控制台</p>
            <h2>{userParams.name || '账户'}的签到检测</h2>
            <span className='muted'>课程活动与群聊普通签到都会显示在下面</span>
          </div>
          <div className='monitor-control'>
            <Chip label={monitorOnline ? '检测中' : '未检测'} color={monitorOnline ? 'success' : 'default'} />
            <Switch checked={monitorOnline} onChange={toggleAccountMonitor} disabled={monitorLoading} />
          </div>
        </div>
        <div className='sign-feed-heading'>
          <div><h3>签到显示栏</h3><span className='muted'>自动每 5 秒刷新，也可以手动刷新</span></div>
          <IconButton aria-label='刷新签到记录' onClick={refreshMonitor}><RefreshIcon /></IconButton>
        </div>
        <div className='sign-feed'>
          {monitorEvents.length === 0 && <div className='empty-feed'>暂未检测到签到活动，开启检测后请等待群聊消息到达。</div>}
          {monitorEvents.map((event) => (
            <div className='sign-event' key={event.id}>
              <div><strong>{event.type === 'detected' ? '检测到签到活动' : event.type === 'processing' ? '正在处理签到' : '签到处理结果'}</strong><span className='muted'>活动 {event.activeId}</span></div>
              <div className='event-right'><span>{event.result || event.signType || '已捕获'}</span><small>{new Date(event.time).toLocaleTimeString()}</small></div>
            </div>
          ))}
        </div>
      </Paper>
      {
        control.start.show &&
        <ButtonBase
          id='start-btn'
          onClick={start}
          sx={{ borderRadius: 50 }}
          className='neum-button'
          disableRipple
        >
          <span>开始</span>
        </ButtonBase>
      }
      {
        progress &&
        <CircularProgress size='5rem' />
      }
      <h1>{sign.activity.name}</h1>
      {
        sign.activity.otherId === 0 &&
        <Box
          component='div'
          id='neum-form'
          className='neum-form'
        >
          <h3>{sign.status}</h3>
          <div id='neum-form-content' className='form-content'>
            <p className='form-title'>勾选签到方式</p><br />
            <label id='label-general' onClick={handleRadio('general')} className='checked' htmlFor='general' style={{ fontSize: '1.6rem' }}>
              <input hidden defaultChecked type='radio' name='sign' id='general' value='general' />
              &nbsp;普通
            </label>&emsp;
            <label id='label-photo' onClick={handleRadio('photo')} className='unchecked' htmlFor='photo' style={{ fontSize: '1.6rem' }}>
              <input hidden type='radio' name='sign' id='photo' value='photo' />
              &nbsp;拍照
            </label>
            <br />
            {
              radio === 1 &&
              <ButtonBase className='neum-form-button'
                onClick={() => {
                  document.getElementById('input-photo')?.click();
                }}
                sx={{
                  width: '16rem'
                }}
              >
                <div id='select-photo' className='text-button'>选择图片</div>
                <input
                  style={{
                    display: 'none'
                  }}
                  id='input-photo'
                  type='file'
                  accept='image/*'
                  onChange={async (e) => {
                    const select_photo = document.getElementById('select-photo');
                    if (e.target.value === '') {
                      select_photo!.innerText = '选择图片';
                    }
                    else {
                      select_photo!.innerText = e.target.value;
                    }
                    updateValue('photo', e.target.files![0]);
                  }}></input>
              </ButtonBase>
            }
            <ButtonBase
              id='sign-btn'
              onClick={onSign_0}
              className='neum-form-button'
              disableRipple>
              {
                btnProgress ? <CircularProgress size='2rem' /> : '签到'
              }
            </ButtonBase>
          </div>
        </Box>
      }
      {
        sign.activity.otherId === 2 &&
        <Box
          component='div'
          id='neum-form'
          className='neum-form'
          sx={{
            minHeight: '450px'
          }}
        >
          <h3>{sign.status}</h3>
          <div id='neum-form-content' className='form-content'>
            <p className='form-title'>经纬度/地址/海拔</p><br />
            <input id='input-latlon' className='input-area' placeholder='例: 116.417492,39.920912' type='text'
              onChange={(e) => {
                updateValue('latlon', e.target.value);
              }} />
            <input id='input-address' className='input-area' placeholder='如: 河南省郑州市x区x大学' type='text'
              onChange={(e) => {
                updateValue('address', e.target.value);
              }} />
            <input id='input-altitude' className='input-area' placeholder='如：123.555' type='text'
              onChange={(e) => {
                updateValue('altitude', e.target.value);
              }} />
            <p className='form-title'>二维码enc参数</p><br />
            <input id='input-enc' className='input-area' type='text' onChange={(e) => {
              updateValue('enc', e.target.value);
            }} />
            <ButtonBase className='neum-form-button'
              onClick={() => {
                document.getElementById('qrcode-upload')?.click();
              }}
              sx={{
                width: '16rem'
              }}
            >
              {
                scanProgress ? <CircularProgress size='2rem' /> : <div>扫描图片</div>
              }
              <input
                style={{
                  display: 'none'
                }}
                id='qrcode-upload'
                type='file'
                accept='image/*'
                onChange={setEncByQRCodeImage}></input>
            </ButtonBase>
            <ButtonBase
              id='sign-btn'
              onClick={onSign_2}
              className='neum-form-button'
              disableRipple
            >签到</ButtonBase>
          </div>
        </Box>
      }
      {
        sign.activity.otherId === 4 &&
        <Box
          component='div'
          id='neum-form'
          className='neum-form'
        >
          <h3>{sign.status}</h3>
          <div id='neum-form-content' className='form-content'>
            <p className='form-title'>经纬度和地址</p><br />
            <input id='input-latlon' className='input-area' placeholder='例: 116.417492,39.920912' type='text'
              onChange={(e) => {
                updateValue('latlon', e.target.value);
                console.log(values);
              }} />
            <input id='input-address' className='input-area' placeholder='如: 河南省郑州市x区x大学' type='text'
              onChange={(e) => {
                updateValue('address', e.target.value);
                console.log(values);
              }} />
            <br />
            <ButtonBase
              id='sign-btn'
              onClick={onSign_4}
              className='neum-form-button'
              disableRipple
            >签到</ButtonBase>
          </div>
        </Box>
      }
      {
        (sign.activity.otherId === 3 || sign.activity.otherId === 5) &&
        <Box
          component='div'
          id='neum-form'
          className='neum-form'
        >
          <h3>{sign.status}</h3>
          <div id='neum-form-content' className='form-content'>
            <p className='form-title'>点击签到</p>
            <br />
            <ButtonBase
              id='sign-btn'
              onClick={onSign_35}
              className='neum-form-button'
              disableRipple
            >签到</ButtonBase>
          </div>
        </Box>
      }

      <Snackbar
        open={alert.show}
        autoHideDuration={3000}
        onClose={() => { setAlert({ show: false, severity: 'info', msg: '' }); }}
      >
        <Alert onClose={() => { setAlert({ show: false, severity: 'info', msg: '' }); }} severity={alert.severity} sx={{ width: '100%' }}>
          {alert.msg}
        </Alert>
      </Snackbar>
    </div>
  );
}

export default DashBoard;
