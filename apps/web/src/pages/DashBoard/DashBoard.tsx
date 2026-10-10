import { AlertColor } from '@mui/material';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { fetch as Fetch } from '../../utils/request';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { activity_api, login_api, monitor_events_api, monitor_start_api, monitor_status_api, monitor_stop_api } from '../../config/api';
import './DashBoard.css';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';

interface AlertInfo {
  msg: string;
  show: boolean;
  severity: AlertColor;
}

function DashBoard() {
  const params = useParams();
  const [userParams, setUserParams] = useState<UserParamsType>({} as UserParamsType);
  const [alert, setAlert] = useState<AlertInfo>({ msg: '', show: false, severity: 'info' });
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorEvents, setMonitorEvents] = useState<any[]>([]);
  const [monitorOnline, setMonitorOnline] = useState(false);
  const [courseRefreshKey, setCourseRefreshKey] = useState(0);

  const showAlert = (msg: string, severity: AlertColor) => {
    setAlert({ msg, show: true, severity });
  };

  const refreshMonitor = async () => {
    if (!params.phone) return;
    try {
      const [status, events] = await Promise.all([
        Fetch(`${monitor_status_api}/${params.phone}`),
        Fetch(`${monitor_events_api}/${params.phone}`)
      ]);
      setMonitorOnline(status?.code === 200);
      setMonitorEvents(events?.events || []);
    } catch {
      // 后端未启动时静默
    }
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
        showAlert(result.code === 200 ? '已开启签到监听' : '已停止签到监听', 'success');
      } else {
        showAlert(result?.msg || '监听状态更新失败', 'error');
      }
      await refreshMonitor();
    } catch (error) {
      console.error(error);
      showAlert('无法连接签到监听服务，请确认后端已启动', 'error');
    } finally {
      setMonitorLoading(false);
    }
  };

  // 手动刷新：查一次所有课程的签到活动
  const manualRefresh = async () => {
    if (!userParams.phone) return;
    try {
      const activity = await Fetch(activity_api, {
        method: 'POST',
        body: {
          uf: userParams.uf,
          _d: userParams._d,
          vc3: userParams.vc3,
          uid: userParams._uid
        }
      });
      if (activity === 'NoActivity') {
        showAlert('当前无签到活动', 'info');
      } else if (activity === 'AuthRequired') {
        showAlert('需要重新登录', 'warning');
      } else if (activity === 'NoCourse') {
        showAlert('未找到课程', 'info');
      } else {
        showAlert('已查询最新签到活动，请查看右侧任务流', 'success');
      }
      await refreshMonitor();
    } catch (error) {
      console.error(error);
      showAlert('查询签到活动失败', 'error');
    }
  };

  // 加载用户参数（IndexedDB），凭证过期自动重新登录
  useEffect(() => {
    const request = indexedDB.open('ui');
    request.onsuccess = () => {
      const db = request.result;
      const request_IDBGET = db.transaction('user', 'readwrite')
        .objectStore('user')
        .get(params.phone as string);
      request_IDBGET.onsuccess = async () => {
        if (!request_IDBGET.result) return;
        setUserParams(request_IDBGET.result);
        if (Date.now() - request_IDBGET.result.date > 432000000) {
          const user = await Fetch(login_api, {
            method: 'POST',
            body: {
              phone: request_IDBGET.result.phone,
              password: request_IDBGET.result.password
            }
          });
          if (user === 'AuthFailed') {
            showAlert('重新登录失败', 'error');
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
              config: request_IDBGET.result.config
            };
            setUserParams(userParam);
            db.transaction('user', 'readwrite')
              .objectStore('user').put(userParam)
              .onsuccess = () => {
                showAlert('凭证已自动更新', 'success');
              };
          }
        }
      };
    };
  }, []);

  // 轮询监听事件
  useEffect(() => {
    refreshMonitor();
    const timer = window.setInterval(refreshMonitor, 5000);
    return () => window.clearInterval(timer);
  }, [params.phone]);

  return (
    <div className='dashboard-page'>
      <LeftPanel
        phone={userParams.phone || ''}
        monitorOnline={monitorOnline}
        monitorLoading={monitorLoading}
        onToggleMonitor={toggleAccountMonitor}
        onManualRefresh={manualRefresh}
        refreshKey={courseRefreshKey}
      />
      <RightPanel
        phone={userParams.phone || ''}
        monitorEvents={monitorEvents}
        onAlert={showAlert}
        onCourseRecorded={() => setCourseRefreshKey(k => k + 1)}
      />
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
