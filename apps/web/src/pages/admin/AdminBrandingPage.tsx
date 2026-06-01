import {
  Button,
  ColorInput,
  Container,
  Group,
  Stack,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { updateBranding } from '../../api/admin';
import { useBranding } from '../../hooks/useBranding';

export function AdminBrandingPage() {
  const qc = useQueryClient();
  const branding = useBranding();
  const [appName, setAppName] = useState(branding.appName);
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? '');
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor);
  const [loginMessage, setLoginMessage] = useState(branding.loginMessage ?? '');

  // Populate once branding has loaded.
  useEffect(() => {
    setAppName(branding.appName);
    setLogoUrl(branding.logoUrl ?? '');
    setPrimaryColor(branding.primaryColor);
    setLoginMessage(branding.loginMessage ?? '');
  }, [branding]);

  const save = useMutation({
    mutationFn: () =>
      updateBranding({
        appName,
        logoUrl: logoUrl.trim() || null,
        primaryColor,
        loginMessage: loginMessage.trim() || null,
      }),
    onSuccess: () => {
      notifications.show({ color: 'green', message: 'Branding updated.' });
      void qc.invalidateQueries({ queryKey: ['branding'] });
    },
    onError: () => notifications.show({ color: 'red', message: 'Failed to update branding.' }),
  });

  return (
    <Container py="lg" size="sm">
      <Stack>
        <Title order={3}>Branding</Title>
        <TextInput
          label="Application name"
          value={appName}
          onChange={(e) => setAppName(e.currentTarget.value)}
        />
        <TextInput
          label="Logo URL"
          placeholder="https://…/logo.png"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.currentTarget.value)}
        />
        <ColorInput label="Primary color" value={primaryColor} onChange={setPrimaryColor} />
        <Textarea
          label="Login message"
          autosize
          minRows={2}
          value={loginMessage}
          onChange={(e) => setLoginMessage(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
