import { Button, CircularProgress, Chip, Switch } from '@mui/material';
import { useEffect, useState } from 'react';
import { deleteCourse, getCourses, saveCourse, uploadToPan } from './Helper';

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
  refreshKey: number; // 变化时重新加载课程列表
}

export default function LeftPanel({ phone, monitorOnline, monitorLoading, onToggleMonitor, onManualRefresh, refreshKey }: LeftPanelProps) {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    </div>
  );
}
