import { Center, Loader } from '@mantine/core';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Mailbox } from './components/Mailbox';
import { useSession } from './hooks/useSession';
import { LoginPage } from './pages/LoginPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';
import { AdminBrandingPage } from './pages/admin/AdminBrandingPage';
import { AdminSpamPage } from './pages/admin/AdminSpamPage';
import { SpamSettingsPage } from './pages/SpamSettingsPage';

export function App() {
  const { user, isLoading } = useSession();

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
    <AppLayout user={user}>
      <Routes>
        <Route path="/" element={<Mailbox />} />
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
  );
}
