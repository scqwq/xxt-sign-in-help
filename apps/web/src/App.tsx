import React from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import './App.css';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  // 只在子页面（如 /dash/:phone）显示返回按钮，主页不显示
  const showBack = location.pathname !== '/' && location.pathname !== '';
  return (
    <div className="App">
      {showBack && (
        <ButtonBase
          onClick={() => { navigate('/', { replace: true }); }}
          sx={{
            position: 'absolute',
            top: 20,
            left: 24,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.8)',
            boxShadow: '4px 4px 8px #c9cccf, -4px -4px 8px #ffffff',
            color: '#4c5e6d',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <ArrowBackIcon fontSize='small' />
          返回
        </ButtonBase>
      )}
      <Outlet />
    </div>
  );
}

export default App;
