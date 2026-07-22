import { useEffect } from 'react';
import { Route, Switch, useLocation, Redirect } from 'wouter';
import { DeviceFrame } from './components/DeviceFrame';
import { AnimatedStage } from './components/AnimatedStage';
import { TabBar } from './components/TabBar';
import { ToastHost } from './components/Toast';
import { useStore } from './store';
import { shouldUseDarkDashboard } from './utils/format';

import { Dashboard } from './screens/Dashboard';
import { Chat } from './screens/Chat';
import { ChatRich } from './screens/ChatRich';
import { Trends } from './screens/Trends';
import { DetailedNight } from './screens/DetailedNight';
import { MorningReveal } from './screens/MorningReveal';
import { Onboarding } from './screens/Onboarding';
import { OnboardingQuestionnaire } from './screens/OnboardingQuestionnaire';
import { BoilAndBite } from './screens/BoilAndBite';
import { DeviceOverview } from './screens/DeviceOverview';
import { Night } from './screens/Night';
import { Comparisons } from './screens/Comparisons';
import { Reorder } from './screens/Reorder';
import { Profile } from './screens/Profile';
import { Science } from './screens/Science';
import { Demo } from './screens/Demo';
import { Auth } from './screens/Auth';

const TABBAR_ROUTES = ['/', '/dashboard/dark', '/trends', '/profile', '/demo'];

export function App() {
  const uiTheme = useStore(s => s.uiTheme);
  const onboardingComplete = useStore(s => s.onboarding.complete);
  const [location, navigate] = useLocation();

  // First-run gate: route new users through onboarding until it's complete.
  // Not a hard auth gate — /auth is exempt so "Sign in" is reachable from
  // the middle of onboarding, and un-onboarded visitors who bounce back from
  // there land on /onboarding again rather than looping through /auth.
  useEffect(() => {
    if (!onboardingComplete && !location.startsWith('/onboarding') && location !== '/auth') {
      navigate('/onboarding', { replace: true });
    }
  }, [onboardingComplete, location, navigate]);

  const themeForRoute = ((): 'day' | 'night' => {
    if (location === '/night') return 'night';
    if (location === '/dashboard/dark') return 'night';
    // Every screen follows the appearance setting — the papercraft-night
    // brand is dark-first across the whole app.
    const dark = uiTheme === 'dark' || (uiTheme === 'auto' && shouldUseDarkDashboard());
    return dark ? 'night' : 'day';
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
            <Route path="/onboarding" component={OnboardingQuestionnaire} />
            <Route path="/onboarding/findings" component={Onboarding} />
            <Route path="/onboarding/setup" component={BoilAndBite} />
            <Route path="/onboarding/device" component={DeviceOverview} />
            <Route path="/profile" component={Profile} />
            <Route path="/auth" component={Auth} />
            <Route path="/reorder" component={Reorder} />
            <Route path="/demo" component={Demo} />
            <Route><Redirect to="/" /></Route>
          </Switch>
        </AnimatedStage>
        {showTabBar && <TabBar />}
      </DeviceFrame>

      <ToastHost />
    </>
  );
}
