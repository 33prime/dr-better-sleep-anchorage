import { useLocation } from 'wouter';
import { HomeFilled, TrendsIcon, ChatIcon, ProfileIcon, Cog } from './icons';

interface TabDef {
  key: string;
  path: string;
  icon: typeof HomeFilled;
  label: string;
  matches: (p: string) => boolean;
  badge?: boolean;
}
const TABS: TabDef[] = [
  { key: 'home',    path: '/',         icon: HomeFilled,  label: 'Home',    matches: (p) => p === '/' || p === '/dashboard/dark' },
  { key: 'trends',  path: '/trends',   icon: TrendsIcon,  label: 'Trends',  matches: (p) => p.startsWith('/trends') },
  { key: 'chat',    path: '/chat',     icon: ChatIcon,    label: 'Chat',    matches: (p) => p.startsWith('/chat'), badge: true },
  { key: 'profile', path: '/profile',  icon: ProfileIcon, label: 'Profile', matches: (p) => p.startsWith('/profile') },
  { key: 'demo',    path: '/demo',     icon: Cog,         label: 'Demo',    matches: (p) => p.startsWith('/demo') },
];

export function TabBar() {
  const [location, navigate] = useLocation();
  return (
    <nav className="tabbar">
      {TABS.map(({ key, path, icon: Icon, label, matches, badge }) => {
        const active = matches(location);
        return (
          <button
            key={key}
            className={`tab tap ${active ? 'active' : ''}`}
            onClick={() => { if (!active) navigate(path); }}
            aria-current={active ? 'page' : undefined}
          >
            {badge && <span className="badge" />}
            <Icon />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
