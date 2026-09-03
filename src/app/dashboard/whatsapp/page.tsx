'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionType, EmbeddedSignupEvent, EmbeddedSignupEventData } from '@/types/meta';

type OnboardingStep = {
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
};

type ConnectionState = 'disconnected' | 'connecting' | 'processing' | 'connected' | 'error';

interface ConnectionInfo {
  connectionId: string;
  wabaId: string;
  phoneNumberId: string;
  connectionType: ConnectionType;
  displayPhoneNumber?: string;
  verifiedName?: string;
  status: string;
}

export default function WhatsAppPage() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [selectedMode, setSelectedMode] = useState<ConnectionType>('CLOUD_API');
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const sessionRef = useRef<{ sessionId: string; nonce: string } | null>(null);
  const sessionInfoRef = useRef<EmbeddedSignupEventData | null>(null);
  const eventTypeRef = useRef<string>('');

  // Load existing connection on mount
  useEffect(() => {
    loadExistingConnection();
  }, []);

  // Set up Meta postMessage listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from Facebook
      if (event.origin && !event.origin.endsWith('facebook.com')) return;

      try {
        const data: EmbeddedSignupEvent = typeof event.data === 'string' 
          ? JSON.parse(event.data) 
          : event.data;

        if (data.type !== 'WA_EMBEDDED_SIGNUP') return;

        console.log('Embedded Signup Event:', data.event, data.data);

        switch (data.event) {
          case 'FINISH':
          case 'FINISH_ONLY_WABA':
          case 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING':
            sessionInfoRef.current = data.data;
            eventTypeRef.current = data.event;
            break;
          case 'CANCEL':
            setError('WhatsApp setup was cancelled. You can try again.');
            setConnectionState('disconnected');
            resetSteps();
            break;
          case 'ERROR':
            setError('An error occurred during WhatsApp setup. Please try again.');
            setConnectionState('error');
            break;
        }
      } catch {
        // Non-JSON postMessage events — ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadExistingConnection = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const res = await fetch('/api/meta/connection', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.connection) {
          setConnectionInfo(data.connection);
          setConnectionState('connected');
        }
      }
    } catch {
      // No existing connection
    }
  };

  const getToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('emote_token');
  };

  const initSteps = (mode: ConnectionType) => {
    const baseSteps: OnboardingStep[] = [
      { label: 'Meta authorization', status: 'pending' },
      { label: 'WhatsApp Business Account detected', status: 'pending' },
      { label: 'Secure token created', status: 'pending' },
      { label: 'Webhooks connected', status: 'pending' },
    ];

    if (mode === 'CLOUD_API') {
      baseSteps.push({ label: 'Phone number registered', status: 'pending' });
      baseSteps.push({ label: 'Automation ready', status: 'pending' });
    } else {
      baseSteps.push({ label: 'WhatsApp Business App connected', status: 'pending' });
      baseSteps.push({ label: 'Message synchronization enabled', status: 'pending' });
    }

    setSteps(baseSteps);
  };

  const updateStep = (index: number, status: OnboardingStep['status']) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, status } : step))
    );
  };

  const resetSteps = () => setSteps([]);

  // ============================================
  // LAUNCH EMBEDDED SIGNUP
  // ============================================

  const launchSignup = useCallback(async () => {
    setError(null);
    setConnectionState('connecting');
    initSteps(selectedMode);

    const token = getToken();
    if (!token) {
      setError('Please log in first.');
      setConnectionState('disconnected');
      return;
    }

    try {
      // 1. Create secure onboarding session
      const sessionRes = await fetch('/api/meta/onboarding/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ connectionType: selectedMode }),
      });

      if (!sessionRes.ok) {
        throw new Error('Failed to create onboarding session');
      }

      const session = await sessionRes.json();
      sessionRef.current = session;

      // 2. Ensure FB SDK is loaded
      await loadFBSDK();

      // 3. Launch FB.login with Embedded Signup v4
      const appId = process.env.NEXT_PUBLIC_META_APP_ID || '2635620483523953';
      const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID || '1315193267178378';

      // Build extras based on connection type (Meta Embedded Signup specification)
      const extras: Record<string, unknown> = {
        feature: 'whatsapp_embedded_signup',
        version: 'v3',
        sessionInfoVersion: '3',
        setup: {},
      };

      // For Coexistence, add featureType
      if (selectedMode === 'COEXISTENCE') {
        extras.featureType = 'whatsapp_business_app_onboarding';
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const FB = (window as any).FB;
      if (!FB) {
        throw new Error('Facebook SDK not loaded');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      FB.login((response: any) => {
        handleFBLoginResponse(response, token);
      }, {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        scope: 'whatsapp_business_management,whatsapp_business_messaging',
        extras,
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setConnectionState('error');
    }
  }, [selectedMode]);

  // ============================================
  // HANDLE FB.LOGIN RESPONSE
  // ============================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFBLoginResponse = async (response: any, token: string) => {
    if (!response.authResponse || !response.authResponse.code) {
      setError('WhatsApp authorization was not completed.');
      setConnectionState('disconnected');
      resetSteps();
      return;
    }

    const code = response.authResponse.code;
    setConnectionState('processing');
    updateStep(0, 'completed'); // Meta authorization

    // CRITICAL: Code TTL is ~30 seconds. Send immediately!
    try {
      const sessionInfo = sessionInfoRef.current || {};
      const eventType = eventTypeRef.current || 'FINISH';

      if (sessionInfo.waba_id) {
        updateStep(1, 'completed'); // WABA detected
      } else {
        updateStep(1, 'active');
      }

      updateStep(2, 'active'); // Token exchange in progress

      const completeRes = await fetch('/api/meta/embedded-signup/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: sessionRef.current?.sessionId,
          code,
          eventType,
          sessionInfo,
        }),
      });

      if (!completeRes.ok) {
        const errData = await completeRes.json();
        throw new Error(errData.error || 'Failed to complete signup');
      }

      const result = await completeRes.json();

      // Update all steps to completed
      updateStep(1, 'completed');
      updateStep(2, 'completed');
      updateStep(3, 'completed');
      updateStep(4, 'completed');
      updateStep(5, 'completed');

      setConnectionInfo({
        connectionId: result.connection.id,
        wabaId: result.connection.wabaId,
        phoneNumberId: result.connection.phoneNumberId,
        connectionType: result.connection.connectionType,
        status: result.connection.status,
      });

      setConnectionState('connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete setup';
      setError(message);
      setConnectionState('error');
      updateStep(2, 'error');
    }
  };

  // ============================================
  // LOAD FACEBOOK JS SDK
  // ============================================

  const loadFBSDK = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Already loaded
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).FB) {
        resolve();
        return;
      }

      // Set up async init
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).fbAsyncInit = function () {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).FB.init({
          appId: process.env.NEXT_PUBLIC_META_APP_ID || '2635620483523953',
          cookie: true,
          xfbml: true,
          version: 'v21.0',
          fedCM: false,
        });
        resolve();
      };

      // Check if script already exists
      if (document.getElementById('facebook-jssdk')) {
        // SDK script exists but FB not ready yet, wait
        const interval = setInterval(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).FB) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(interval);
          reject(new Error('Facebook SDK loading timeout'));
        }, 10000);
        return;
      }

      // Load SDK script
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = () => reject(new Error('Failed to load Facebook SDK'));
      document.body.appendChild(script);
    });
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">WhatsApp Connection</h1>
        <p className="mt-1 text-sm text-slate-400">
          Connect your WhatsApp Business account to start receiving and sending messages.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <span className="text-red-400">⚠️</span>
          <div>
            <p className="text-sm font-medium text-red-300">{error}</p>
            {error === 'Please log in first.' ? (
              <a
                href="/login"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-opacity hover:opacity-90"
              >
                Log In Now →
              </a>
            ) : (
              <button
                onClick={() => setError(null)}
                className="mt-1 text-xs text-red-400 hover:text-red-300"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* Connected State */}
      {connectionState === 'connected' && connectionInfo && (
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-3 w-3 items-center justify-center">
              <span className="absolute h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </div>
            <h2 className="text-lg font-semibold text-emerald-400">Connected</h2>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              {connectionInfo.connectionType === 'COEXISTENCE' ? 'Coexistence' : 'Cloud API'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <InfoField label="WABA ID" value={connectionInfo.wabaId} />
            <InfoField label="Phone Number ID" value={connectionInfo.phoneNumberId} />
            <InfoField label="Connection Type" value={connectionInfo.connectionType} />
            <InfoField label="Status" value={connectionInfo.status} />
            {connectionInfo.displayPhoneNumber && (
              <InfoField label="Phone Number" value={connectionInfo.displayPhoneNumber} />
            )}
            {connectionInfo.verifiedName && (
              <InfoField label="Business Name" value={connectionInfo.verifiedName} />
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={launchSignup}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5"
            >
              Reconnect
            </button>
            <button
              onClick={() => {
                setConnectionState('disconnected');
                setConnectionInfo(null);
              }}
              className="rounded-xl border border-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/5"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Disconnected State — Connection Options */}
      {(connectionState === 'disconnected' || connectionState === 'error') && (
        <div className="space-y-4">
          {/* Mode Selection */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h2 className="text-base font-semibold text-white mb-4">Choose Connection Type</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                title="Cloud API"
                description="Connect a new or existing WhatsApp Business Platform number"
                icon="☁️"
                selected={selectedMode === 'CLOUD_API'}
                onClick={() => setSelectedMode('CLOUD_API')}
              />
              <ModeCard
                title="Coexistence"
                description="Connect an existing WhatsApp Business App number (keep mobile app access)"
                icon="📱"
                selected={selectedMode === 'COEXISTENCE'}
                onClick={() => setSelectedMode('COEXISTENCE')}
              />
            </div>

            {selectedMode === 'COEXISTENCE' && (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-xs text-amber-300">
                  <strong>Important:</strong> Coexistence mode keeps your WhatsApp Business mobile
                  app active alongside Cloud API. Not all numbers are eligible. Meta will verify
                  eligibility during the signup process.
                </p>
              </div>
            )}
          </div>

          {/* Connect Button */}
          <button
            onClick={launchSignup}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            🔗 Connect WhatsApp
          </button>
        </div>
      )}

      {/* Processing State — Onboarding Steps */}
      {(connectionState === 'connecting' || connectionState === 'processing') && steps.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <h2 className="text-base font-semibold text-white mb-4">Setting up your connection</h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <StepIcon status={step.status} />
                <span
                  className={`text-sm ${
                    step.status === 'completed'
                      ? 'text-emerald-400'
                      : step.status === 'active'
                      ? 'text-white'
                      : step.status === 'error'
                      ? 'text-red-400'
                      : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-mono text-slate-200 break-all">{value}</p>
    </div>
  );
}

function ModeCard({
  title,
  description,
  icon,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  icon: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-all duration-200 ${
        selected
          ? 'border-emerald-500/30 bg-emerald-500/5 ring-1 ring-emerald-500/20'
          : 'border-white/5 bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className={`text-sm font-semibold ${selected ? 'text-emerald-400' : 'text-slate-200'}`}>
            {title}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        </div>
      </div>
    </button>
  );
}

function StepIcon({ status }: { status: OnboardingStep['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs text-emerald-400">
          ✓
        </span>
      );
    case 'active':
      return (
        <span className="flex h-5 w-5 items-center justify-center">
          <Spinner size="sm" />
        </span>
      );
    case 'error':
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-xs text-red-400">
          ✕
        </span>
      );
    default:
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 text-xs text-slate-600">
          ○
        </span>
      );
  }
}

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <svg className={`animate-spin ${sizeClass} text-emerald-400`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
