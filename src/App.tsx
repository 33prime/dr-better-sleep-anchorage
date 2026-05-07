import { Route, Switch, useLocation } from 'wouter';
import { DeviceFrame } from './components/DeviceFrame';
import { AnimatedStage } from './components/AnimatedStage';
import { TabBar } from './components/TabBar';
import { ToastHost } from './components/Toast';
import { DemoControls } from './components/DemoControls';
import { useStore } from './store';
import { shouldUseDarkDashboard } from './utils/format';

import { Dashboard } from './screens/Dashboard';
import { Chat } from './screens/Chat';
import { ChatRich } from './screens/ChatRich';
import { Trends } from './screens/Trends';
import { DetailedNight } from './screens/DetailedNight';
import { MorningReveal } from './screens/MorningReveal';
import { Onboarding } from './screens/Onboarding';
import { BoilAndBite } from './screens/BoilAndBite';
import { DeviceOverview } from './screens/DeviceOverview';
import { Night } from './screens/Night';
import { Comparisons } from './screens/Comparisons';
import { Reorder } from './screens/Reorder';
import { Science } from './screens/Science';
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
            <Route path="/chat/rich" component={ChatRich} />
            <Route path="/trends" component={Trends} />
            <Route path="/trends/compare" component={Comparisons} />
            <Route path="/trends/science" component={Science} />
            <Route path="/night" component={Night} />
            <Route path="/night/:date" component={DetailedNight} />
            <Route path="/onboarding" component={Onboarding} />
            <Route path="/onboarding/setup" component={BoilAndBite} />
            <Route path="/onboarding/device" component={DeviceOverview} />
            <Route path="/profile" component={Reorder} />
            <Route><Stub title="Not found" /></Route>
          </Switch>
        </AnimatedStage>
        {showTabBar && <TabBar />}
      </DeviceFrame>

      <a className="corner-link" href="/gallery.html">All screens →</a>
      <DemoControls />
      <ToastHost />
    </>
  );
}
