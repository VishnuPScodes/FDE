import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import styles from './ProfilePage.module.css';

interface LoginEvent {
  id: string;
  created_at: string;
  ip: string;
  country: string;
  city: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  device_type: string;
}

interface Device {
  id: string;
  browser: string;
  os: string;
  device_type: string;
  first_seen: string;
  last_seen: string;
  login_count: number;
}

export default function ProfilePage() {
  const { profile, user } = useAuth();
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [eventsRes, devicesRes] = await Promise.all([
        supabase
          .from('login_events')
          .select('id, created_at, ip, country, city, browser, browser_version, os, os_version, device_type')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('devices')
          .select('*')
          .order('last_seen', { ascending: false }),
      ]);

      if (eventsRes.data) setLoginEvents(eventsRes.data as LoginEvent[]);
      if (devicesRes.data) setDevices(devicesRes.data as Device[]);
      setLoading(false);
    };

    void fetchData();
  }, [user]);

  if (!profile) return null;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Your profile</h1>

      {/* Profile Card */}
      <div className={styles.profileCard}>
        <div className={styles.profileAvatar}>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} referrerPolicy="no-referrer" />
          ) : (
            <span className={styles.avatarFallback}>{profile.full_name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className={styles.profileInfo}>
          <h2>{profile.full_name}</h2>
          <p className={styles.email}>{profile.google_email}</p>
          <div className={styles.profileMeta}>
            <span>Joined {new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
            <span className={`badge ${profile.consent_version ? 'badge-success' : 'badge-warning'}`}>
              {profile.consent_version ? `Consent v${profile.consent_version}` : 'Consent needed'}
            </span>
          </div>
        </div>
      </div>

      {/* Devices */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your devices</h2>
        <p className={styles.sectionDesc}>
          Devices recognized from your login history. We collect this data to keep your account
          secure and improve the platform.
        </p>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : devices.length === 0 ? (
          <p className={styles.empty}>No device data yet. This will populate after your first sign-in with the API connected.</p>
        ) : (
          <div className={styles.devicesList}>
            {devices.map((d) => (
              <div key={d.id} className={styles.deviceCard}>
                <span className={styles.deviceIcon}>
                  {d.device_type === 'mobile' ? '📱' : d.device_type === 'tablet' ? '📋' : '💻'}
                </span>
                <div className={styles.deviceInfo}>
                  <span className={styles.deviceName}>{d.browser} on {d.os}</span>
                  <span className={styles.deviceMeta}>
                    {d.login_count} sign-in{d.login_count !== 1 ? 's' : ''} · Last seen{' '}
                    {new Date(d.last_seen).toLocaleDateString('en-IN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Login History */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Login history</h2>
        <p className={styles.sectionDesc}>
          Your last 20 sign-in events. Contact us if you see anything you don't recognise.
        </p>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : loginEvents.length === 0 ? (
          <p className={styles.empty}>No login events yet.</p>
        ) : (
          <div className={styles.eventsTable}>
            <div className={styles.eventsHeader}>
              <span>Time</span>
              <span>Browser / OS</span>
              <span>Location</span>
              <span>Device</span>
            </div>
            {loginEvents.map((ev) => (
              <div key={ev.id} className={styles.eventsRow}>
                <span className={styles.eventsTime}>
                  {new Date(ev.created_at).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>{ev.browser} {ev.browser_version} / {ev.os} {ev.os_version}</span>
                <span>{[ev.city, ev.country].filter(Boolean).join(', ') || '—'}</span>
                <span className={styles.deviceBadge}>{ev.device_type || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
