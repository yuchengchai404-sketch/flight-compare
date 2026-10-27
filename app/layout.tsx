import type { Metadata } from 'next';import './globals.css';
export const metadata:Metadata={title:'机票比价 · 我的查询工作台',description:'自定义机票行程，从官网读取可见报价，按相同日期、人数、舱位和税费口径比较。',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
