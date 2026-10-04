import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {title:'เภสัชพร้อม • ระบบบริหารร้านยา',description:'พื้นที่ทำงานสำหรับเภสัชกร งานขาย และคลังยา'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="th"><body>{children}</body></html>}
