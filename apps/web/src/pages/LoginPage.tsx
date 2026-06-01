import { Button, Card, Center, Image, Stack, Text, Title } from '@mantine/core';
import { IconLogin2 } from '@tabler/icons-react';
import { useBranding } from '../hooks/useBranding';
import { startLogin } from '../hooks/useSession';

export function LoginPage() {
  const branding = useBranding();

  return (
    <Center mih="100vh">
      <Card shadow="md" radius="md" padding="xl" withBorder w={380}>
        <Stack align="center" gap="md">
          {branding.logoUrl ? (
            <Image src={branding.logoUrl} alt={branding.appName} h={48} w="auto" fit="contain" />
          ) : null}
          <Title order={2} c={branding.primaryColor}>
            {branding.appName}
          </Title>
          {branding.loginMessage ? (
            <Text c="dimmed" ta="center" size="sm">
              {branding.loginMessage}
            </Text>
          ) : null}
          <Button
            fullWidth
            size="md"
            leftSection={<IconLogin2 size={18} />}
            onClick={startLogin}
            color={branding.primaryColor}
          >
            Sign in
          </Button>
          <Text c="dimmed" size="xs" ta="center">
            You'll be redirected to your identity provider. Passkeys supported.
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}
