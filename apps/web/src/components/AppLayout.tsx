import { AppShell, Avatar, Button, Group, Menu, Text, Title, UnstyledButton } from '@mantine/core';
import {
  IconAddressBook,
  IconCalendar,
  IconLogout,
  IconMail,
  IconSettings,
  IconShieldCog,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CurrentUser } from '@jmail/shared';
import { useBranding } from '../hooks/useBranding';
import { useLogout } from '../hooks/useSession';

function NavButton({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Button
      component={Link}
      to={to}
      size="xs"
      variant={active ? 'light' : 'subtle'}
      leftSection={icon}
    >
      {label}
    </Button>
  );
}

export function AppLayout({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const branding = useBranding();
  const logout = useLogout();
  const initials = (user.displayName ?? user.email).slice(0, 2).toUpperCase();

  return (
    <AppShell header={{ height: 56 }} padding={0}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.appName} height={28} />
              ) : null}
              <Title order={4} c={branding.primaryColor}>
                {branding.appName}
              </Title>
            </Group>
            <Group gap={4} wrap="nowrap">
              <NavButton to="/" icon={<IconMail size={16} />} label="Mail" />
              <NavButton to="/contacts" icon={<IconAddressBook size={16} />} label="Contacts" />
              <NavButton to="/calendar" icon={<IconCalendar size={16} />} label="Calendar" />
              <NavButton to="/settings/spam" icon={<IconSettings size={16} />} label="Spam" />
              {user.isAdmin ? (
                <NavButton to="/admin/spam" icon={<IconShieldCog size={16} />} label="Admin" />
              ) : null}
            </Group>
          </Group>

          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar color={branding.primaryColor} radius="xl" size={32}>
                    {initials}
                  </Avatar>
                  <Text size="sm" visibleFrom="sm">
                    {user.email}
                  </Text>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.email}</Menu.Label>
              {user.isAdmin ? (
                <>
                  <Menu.Item component={Link} to="/admin/branding">
                    Branding
                  </Menu.Item>
                  <Menu.Item component={Link} to="/admin/audit">
                    Audit log
                  </Menu.Item>
                  <Menu.Divider />
                </>
              ) : null}
              <Menu.Item leftSection={<IconLogout size={16} />} onClick={logout}>
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
