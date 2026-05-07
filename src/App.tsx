import { Route, Switch, useLocation } from 'wouter';
import { DeviceFrame } from './components/DeviceFrame';
import { AnimatedStage } from './components/AnimatedStage';
import { TabBar } from './components/TabBar';
import { ToastHost } from './components/Toast';
import { useStore } from './store';
import { shouldUseDarkDashboard } from './utils/format';

import { Dashboard } from './screens/Dashboard';
import { Chat } from './screens/Chat';
import { Trends } from './screens/Trends';
import { DetailedNight } from './screens/DetailedNight';
import { MorningReveal } from './screens/MorningReveal';
import { Stub } from './screens/Stub';

const TABBAR_ROUTES = ['/', '/dashboard/dark', '/trends', '/profile'];

export function App() {
  const uiTheme = useStore(s => s.uiTheme);
  const [location] = useLocation();

  const themeForRoute = ((): 'day' | 'night' => {
    if (location === '/night') return 'night';
    if (location === '/' || location === '/dashboard/dark') {
      const dark = uiTheme === 'dark' || (uiTheme === 'auto' && shouldUseDarkDashboard()) || location === '/dashboard/dark';
      return dark ? 'night' : 'day';
    }
    return 'day';
  })();

  const showTabBar = TABBAR_ROUTES.includes(location);

  return (
    <>
      <DeviceFrame theme={themeForRoute}>
        <AnimatedStage>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard/dark" component={Dashboard} />
            <Route path="/morning" component={MorningReveal} />
            <Route path="/chat" component={Chat} />
            <Route path="/chat/rich"><Stub title="Chat · rich data" /></Route>
            <Route path="/trends" component={Trends} />
            <Route path="/trends/compare"><Stub title="Comparisons" /></Route>
            <Route path="/trends/science"><Stub title="The science" /></Route>
            <Route path="/night"><Stub title="Live night tracking" /></Route>
            <Route path="/night/:date" component={DetailedNight} />
            <Route path="/onboarding"><Stub title="Onboarding triage" /></Route>
            <Route path="/onboarding/setup"><Stub title="Boil & bite" /></Route>
            <Route path="/onboarding/device"><Stub title="Device overview" /></Route>
            <Route path="/profile"><Stub title="Reorder" /></Route>
            <Route><Stub title="Not found" /></Route>
          </Switch>
        </AnimatedStage>
        {showTabBar && <TabBar />}
      </DeviceFrame>

      <a className="corner-link" href="/gallery.html">All screens →</a>
      <ToastHost />
    </>
  );
}
