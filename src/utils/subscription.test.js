import {
  getSubscriptionStatus,
  setSubscriptionStatus,
  isPro,
  isFree,
  getDailyCounts,
  canStartSessionToday,
  incrementSessionCount,
} from './subscription';

beforeEach(() => {
  localStorage.clear();
});

describe('Subscription status', () => {
  test('default status is free', () => {
    expect(getSubscriptionStatus()).toBe('free');
    expect(isFree()).toBe(true);
    expect(isPro()).toBe(false);
  });

  test('setSubscriptionStatus to pro', () => {
    setSubscriptionStatus('pro');
    expect(getSubscriptionStatus()).toBe('pro');
    expect(isPro()).toBe(true);
    expect(isFree()).toBe(false);
  });

  test('setSubscriptionStatus to free', () => {
    setSubscriptionStatus('pro');
    setSubscriptionStatus('free');
    expect(getSubscriptionStatus()).toBe('free');
    expect(isFree()).toBe(true);
  });

  test('invalid value defaults to free', () => {
    setSubscriptionStatus('garbage');
    expect(getSubscriptionStatus()).toBe('free');
  });

  test('setSubscriptionStatus dispatches event', () => {
    const spy = jest.spyOn(window, 'dispatchEvent');
    setSubscriptionStatus('pro');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'cc:subscriptionChanged' }));
    spy.mockRestore();
  });
});

describe('Daily quota', () => {
  test('initial count is 0', () => {
    const q = getDailyCounts();
    expect(q.sessions).toBe(0);
  });

  test('canStartSessionToday returns true when under limit', () => {
    expect(canStartSessionToday(3)).toBe(true);
  });

  test('incrementSessionCount increments', () => {
    expect(incrementSessionCount()).toBe(1);
    expect(incrementSessionCount()).toBe(2);
    expect(incrementSessionCount()).toBe(3);
    expect(getDailyCounts().sessions).toBe(3);
  });

  test('canStartSessionToday returns false at limit', () => {
    incrementSessionCount();
    incrementSessionCount();
    incrementSessionCount();
    expect(canStartSessionToday(3)).toBe(false);
  });

  test('old day resets count', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    localStorage.setItem('cc_free_quota', JSON.stringify({ dayISO: yesterday, sessions: 5 }));
    const q = getDailyCounts();
    expect(q.sessions).toBe(0);
    expect(canStartSessionToday(3)).toBe(true);
  });
});

describe('Security: localStorage manipulation', () => {
  test('server sync overrides manipulated localStorage', () => {
    // Simulate a user manually setting localStorage to pro
    localStorage.setItem('cc_subscription_status', 'pro');
    expect(getSubscriptionStatus()).toBe('pro');
    // Server sync sets it back to free (simulating serverAllowsStart behavior)
    setSubscriptionStatus('free');
    expect(getSubscriptionStatus()).toBe('free');
    expect(isFree()).toBe(true);
  });
});
