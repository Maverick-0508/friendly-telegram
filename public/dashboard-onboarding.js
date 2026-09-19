/* ============================================================
   Dashboard Onboarding Checklist — client-side state module.

   Tracks the "Account Setup" milestones for a logged-in client
   and persists progress to localStorage so it survives refreshes,
   logins and offline (PWA) sessions. The backend has no per-client
   onboarding columns, so this widget owns its own state and exposes
   a tiny subscribe API the dashboard uses to re-render progress and
   seamlessly swap to full operational tools once complete.

   API:
     DashboardOnboarding.get()            -> snapshot { milestones, doneCount, totalCount, percentComplete, isComplete, isDismissed }
     DashboardOnboarding.toggle(key)      -> mark a milestone done/undone, returns snapshot
     DashboardOnboarding.setCompleted(key, bool)
     DashboardOnboarding.dismiss()        -> keep the checklist hidden for good
     DashboardOnboarding.reset()          -> dev convenience
     DashboardOnboarding.subscribe(fn)    -> returns unsubscribe; fn(snapshot)
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'lawncraft-onboarding-v1';

  var MILESTONES = [
    {
      key: 'verify-address',
      label: 'Verify Address',
      description: 'Confirm your property details so dispatch reaches the right gate.',
      icon: 'house-chimney-window',
      anchor: 'account-details'
    },
    {
      key: 'set-preferences',
      label: 'Set Service Preferences',
      description: 'Pick mowing frequency, add-ons and your preferred contact window.',
      icon: 'sliders',
      anchor: 'quick-addons-section'
    },
    {
      key: 'add-payment',
      label: 'Pay with M-Pesa',
      description: 'Settle your first invoice with Lipa Na M-Pesa: a prompt is sent to your phone and your receipt appears here.',
      icon: 'mobile-screen-button',
      anchor: 'outstanding-bills-section'
    }
  ];

  function read() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return { completed: [], dismissed: false };
      var parsed = JSON.parse(raw);
      return {
        completed: Array.isArray(parsed.completed) ? parsed.completed : [],
        dismissed: Boolean(parsed.dismissed)
      };
    } catch (_) {
      return { completed: [], dismissed: false };
    }
  }

  function write(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (_) {
      /* storage full/blocked — acceptable degradation */
    }
  }

  var state = read();
  var listeners = new Set();

  function snapshot() {
    var completedSet = new Set(state.completed);
    var done = 0;
    var milestones = MILESTONES.map(function (m) {
      var isDone = completedSet.has(m.key);
      if (isDone) done += 1;
      return {
        key: m.key,
        label: m.label,
        description: m.description,
        icon: m.icon,
        anchor: m.anchor,
        done: isDone
      };
    });
    return {
      milestones: milestones,
      doneCount: done,
      totalCount: MILESTONES.length,
      percentComplete: MILESTONES.length ? Math.round((done / MILESTONES.length) * 100) : 100,
      isComplete: MILESTONES.length > 0 && done === MILESTONES.length,
      isDismissed: state.dismissed
    };
  }

  function notify() {
    var snap = snapshot();
    listeners.forEach(function (fn) {
      try { fn(snap); } catch (_) { /* listener errors must not break state */ }
    });
  }

  function setCompleted(key, done) {
    var set = new Set(state.completed);
    if (done) set.add(key); else set.delete(key);
    state = { completed: Array.from(set), dismissed: false };
    write(state);
    notify();
    return snapshot();
  }

  function toggle(key) {
    var wasDone = state.completed.indexOf(key) !== -1;
    return setCompleted(key, !wasDone);
  }

  function dismiss() {
    state = { completed: state.completed, dismissed: true };
    write(state);
    notify();
    return snapshot();
  }

  function reset() {
    state = { completed: [], dismissed: false };
    write(state);
    notify();
    return snapshot();
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.add(fn);
    return function unsubscribe() {
      listeners.delete(fn);
    };
  }

  window.DashboardOnboarding = {
    get: snapshot,
    toggle: toggle,
    setCompleted: setCompleted,
    dismiss: dismiss,
    reset: reset,
    subscribe: subscribe,
    MILESTONES: MILESTONES
  };
})();