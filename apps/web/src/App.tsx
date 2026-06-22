import { Center, Loader } from '@mantine/core';
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Mailbox } from './components/Mailbox';
import { MobileMailbox } from './components/MobileMailbox';
import { useIsMobile } from './hooks/useIsMobile';
import { useSession } from './hooks/useSession';
import { LoginPage } from './pages/LoginPage';

// Secondary views are split into their own chunks so the initial load only
// ships the mailbox. They're reached by navigation, so a brief Suspense
// fallback while the chunk downloads is fine.
const named = <T extends object>(key: keyof T) => (m: T) => ({ default: m[key] });

const ContactsPage = lazy(() =>
  import('./pages/ContactsPage').then(named('ContactsPage')),
);
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(named('CalendarPage')));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(named('SettingsPage')));
const SpamSettingsPage = lazy(() =>
  import('./pages/SpamSettingsPage').then(named('SpamSettingsPage')),
);
const MessageWindowPage = lazy(() =>
  import('./pages/MessageWindowPage').then(named('MessageWindowPage')),
);
const AdminAuditPage = lazy(() =>
  import('./pages/admin/AdminAuditPage').then(named('AdminAuditPage')),
);
const AdminBrandingPage = lazy(() =>
  import('./pages/admin/AdminBrandingPage').then(named('AdminBrandingPage')),
);
const AdminSpamPage = lazy(() => import('./pages/admin/AdminSpamPage').then(named('AdminSpamPage')));

function PageFallback() {
  return (
    <Center h="60vh">
      <Loader />
    </Center>
  );
}

export function App() {
  const { user, isLoading } = useSession();
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/message/:folder/:uid" element={<MessageWindowPage />} />
        <Route
          path="*"
          element={
            <AppLayout user={user}>
              <Routes>
                <Route path="/" element={isMobile ? <MobileMailbox /> : <Mailbox />} />
                <Route path="/contacts" element={<ContactsPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/spam" element={<SpamSettingsPage />} />
                {user.isAdmin ? (
                  <>
                    <Route path="/admin/spam" element={<AdminSpamPage />} />
                    <Route path="/admin/branding" element={<AdminBrandingPage />} />
                    <Route path="/admin/audit" element={<AdminAuditPage />} />
                  </>
                ) : null}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          }
        />
      </Routes>
    </Suspense>
  );
}
