import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: '#4c8dff', colorBgBase: '#0f1115', borderRadius: 6 },
      }}
      // antd 默认会给「恰好两个汉字」的按钮插入空格（中止 → 中 止），
      // 这会让按钮的可访问名与代码里写的文案对不上，关掉更省心
      button={{ autoInsertSpace: false }}
    >
      {/* AntdApp 提供 message / modal 的上下文，静态调用在 antd 6 里拿不到主题配置 */}
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
