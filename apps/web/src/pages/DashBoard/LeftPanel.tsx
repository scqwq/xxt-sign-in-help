import { Button, CircularProgress, Chip, Switch, TextField, MenuItem, FormControlLabel } from '@mui/material';
import { useEffect, useState } from 'react';
import { deleteCourse, getCourses, saveCourse, uploadToPan } from './Helper';

interface MapSettings {
  amapKey: string;
  defaultCity: string;
  defaultLat: number;
  defaultLon: number;
  coordConvert: boolean;
}

const DEFAULT_MAP_SETTINGS: MapSettings = {
  amapKey: '',
  defaultCity: '北京',
  defaultLat: 39.9042,
  defaultLon: 116.4074,
  coordConvert: true,
};

const PRESET_CITIES = [
  { name: '北京', lat: 39.9042, lon: 116.4074 },
  { name: '上海', lat: 31.2304, lon: 121.4737 },
  { name: '广州', lat: 23.1291, lon: 113.2644 },
  { name: '深圳', lat: 22.5431, lon: 114.0579 },
  { name: '郑州', lat: 34.7466, lon: 113.6253 },
  { name: '武汉', lat: 30.5928, lon: 114.3055 },
  { name: '成都', lat: 30.5728, lon: 104.0668 },
  { name: '西安', lat: 34.3416, lon: 108.9398 },
  { name: '南京', lat: 32.0603, lon: 118.7969 },
  { name: '杭州', lat: 30.2741, lon: 120.1551 },
  { name: '重庆', lat: 29.5630, lon: 106.5516 },
  { name: '天津', lat: 39.3434, lon: 117.3616 },
  { name: '长沙', lat: 28.2282, lon: 112.9388 },
  { name: '青岛', lat: 36.0671, lon: 120.3826 },
  { name: '合肥', lat: 31.8206, lon: 117.2272 },
  { name: '福州', lat: 26.0745, lon: 119.2965 },
  { name: '厦门', lat: 24.4798, lon: 118.0894 },
  { name: '济南', lat: 36.6512, lon: 117.1201 },
  { name: '太原', lat: 37.8706, lon: 112.5488 },
  { name: '石家庄', lat: 38.0428, lon: 114.5149 },
  { name: '南昌', lat: 28.6820, lon: 115.8578 },
  { name: '南宁', lat: 22.8170, lon: 108.3669 },
  { name: '贵阳', lat: 26.6470, lon: 106.6302 },
  { name: '昆明', lat: 24.8801, lon: 102.8329 },
  { name: '兰州', lat: 36.0611, lon: 103.8343 },
  { name: '哈尔滨', lat: 45.8038, lon: 126.5350 },
  { name: '长春', lat: 43.8171, lon: 125.3235 },
  { name: '沈阳', lat: 41.8057, lon: 123.4315 },
  { name: '大连', lat: 38.9140, lon: 121.6147 },
  { name: '海口', lat: 20.0440, lon: 110.1990 },
];

function loadMapSettings(): MapSettings {
  try {
    const raw = localStorage.getItem('map_settings');
    if (raw) return { ...DEFAULT_MAP_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_MAP_SETTINGS;
}

function saveMapSettings(s: MapSettings) {
  localStorage.setItem('map_settings', JSON.stringify(s));
}

interface CourseRecord {
  courseId: string;
  courseName: string;
  autoSign: boolean;
  photoPath: string;
}

interface LeftPanelProps {
  phone: string;
  monitorOnline: boolean;
  monitorLoading: boolean;
  onToggleMonitor: () => void;
  onManualRefresh: () => void;
  refreshKey: number;
}

export default function LeftPanel({ phone, monitorOnline, monitorLoading, onToggleMonitor, onManualRefresh, refreshKey }: LeftPanelProps) {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mapSettings, setMapSettings] = useState<MapSettings>(loadMapSettings);

  useEffect(() => {
    if (!phone) return;
    setLoading(true);
    getCourses(phone).then((res: any) => {
      setCourses(res?.courses || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [phone, refreshKey]);

  const handleAutoSignChange = (courseId: string, autoSign: boolean) => {
    setCourses(prev => prev.map(c => c.courseId === courseId ? { ...c, autoSign } : c));
    saveCourse(phone, { courseId, autoSign });
  };

  const handlePhotoPathChange = (courseId: string, photoPath: string) => {
    setCourses(prev => prev.map(c => c.courseId === courseId ? { ...c, photoPath } : c));
  };

  const handlePhotoPathBlur = (courseId: string, photoPath: string) => {
    saveCourse(phone, { courseId, photoPath });
  };

  const handleDelete = async (courseId: string) => {
    await deleteCourse(phone, courseId);
    setCourses(prev => prev.filter(c => c.courseId !== courseId));
  };

  const updateMapSettings = (partial: Partial<MapSettings>) => {
    const next = { ...mapSettings, ...partial };
    setMapSettings(next);
    saveMapSettings(next);
  };

  return (
    <div className='dashboard-left'>
      {/* 监听控制 */}
      <div className='panel'>
        <h3>监听控制</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{monitorOnline ? '监听中' : '未监听'}</span>
          <Switch checked={monitorOnline} onChange={onToggleMonitor} disabled={monitorLoading} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Chip
            label={monitorOnline ? '检测中' : '已停止'}
            color={monitorOnline ? 'success' : 'default'}
            size='small'
            style={{ marginRight: 8 }}
          />
          {monitorLoading && <CircularProgress size={16} style={{ verticalAlign: 'middle' }} />}
        </div>
      </div>

      {/* 手动刷新 */}
      <div className='panel'>
        <h3>手动操作</h3>
        <Button variant='outlined' fullWidth onClick={onManualRefresh} style={{ borderRadius: 10 }}>
          手动刷新签到
        </Button>
        <p className='muted' style={{ marginTop: 8 }}>查询一次所有课程，找当前最新签到活动</p>
        <Button
          variant='outlined'
          fullWidth
          onClick={() => document.getElementById('pan-upload-input')?.click()}
          style={{ borderRadius: 10, marginTop: 12 }}
          disabled={uploading}
        >
          {uploading ? <CircularProgress size={16} /> : '上传图片到云盘'}
        </Button>
        <input
          id='pan-upload-input'
          type='file'
          accept='image/*'
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const res = await uploadToPan(phone, file);
              if (res?.success) {
                alert(`上传成功！objectId: ${res.objectId}`);
              } else {
                alert(res?.msg || '上传失败');
              }
            } catch (err: any) {
              alert(err?.message || '上传失败');
            }
            setUploading(false);
            e.target.value = '';
          }}
        />
        <p className='muted' style={{ marginTop: 8 }}>上传后获得 objectId，可用于拍照签到</p>
      </div>

      {/* 已记录课程 */}
      <div className='panel'>
        <h3>已记录课程</h3>
        {loading && <div className='muted'>加载中...</div>}
        {!loading && courses.length === 0 && <div className='muted'>暂无记录的课程。检测到新签到时可在右侧点"记录课程"。</div>}
        {courses.map((course) => (
          <div className='course-card' key={course.courseId}>
            <div className='course-header'>
              <span className='course-name' title={course.courseName || course.courseId}>{course.courseName || course.courseId}</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className='muted' style={{ fontSize: '0.78rem', marginRight: 4 }}>自动</span>
                <Switch
                  size='small'
                  checked={course.autoSign}
                  onChange={(e) => handleAutoSignChange(course.courseId, e.target.checked)}
                />
                <span className='delete-btn' onClick={() => handleDelete(course.courseId)}>✕</span>
              </div>
            </div>
            <input
              className='photo-path-input'
              placeholder='拍照签到图片路径（服务端路径，如 D:/photos/sign.jpg）'
              value={course.photoPath || ''}
              onChange={(e) => handlePhotoPathChange(course.courseId, e.target.value)}
              onBlur={(e) => handlePhotoPathBlur(course.courseId, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* 地图设置 */}
      <div className='panel'>
        <h3>地图设置</h3>
        <p className='muted' style={{ marginBottom: 12 }}>配置位置签到地图的默认城市和搜索功能</p>
        <TextField
          select
          label='默认城市'
          value={mapSettings.defaultCity}
          onChange={(e) => {
            const city = PRESET_CITIES.find(c => c.name === e.target.value);
            if (city) updateMapSettings({ defaultCity: city.name, defaultLat: city.lat, defaultLon: city.lon });
          }}
          fullWidth
          variant='outlined'
          size='small'
          style={{ marginBottom: 12 }}
        >
          {PRESET_CITIES.map(c => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}
        </TextField>
        <TextField
          label='高德地图 API Key'
          value={mapSettings.amapKey}
          onChange={(e) => updateMapSettings({ amapKey: e.target.value })}
          fullWidth
          variant='outlined'
          size='small'
          placeholder='留空则无法使用地址搜索'
          helperText='在高德开放平台 lbs.amap.com 免费申请「Web服务」Key'
          style={{ marginBottom: 12 }}
        />
        <FormControlLabel
          label='启用坐标转换 (GCJ-02→WGS-84)'
          control={
            <Switch
              size='small'
              checked={mapSettings.coordConvert}
              onChange={(e) => updateMapSettings({ coordConvert: e.target.checked })}
            />
          }
        />
      </div>
    </div>
  );
}
