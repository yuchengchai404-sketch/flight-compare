import Dashboard from './dashboard';
import snapshots from '@/lib/snapshots.json';
export default async function Page(){return <Dashboard initial={snapshots}/>;}
