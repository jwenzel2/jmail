import { Card, Container, Select, Stack, Text, Title } from '@mantine/core';
import {
  MAIL_PAGE_SIZE_OPTIONS,
  useMailPageSize,
  type MailPageSize,
} from '../hooks/useMailSettings';

const pageSizeOptions = MAIL_PAGE_SIZE_OPTIONS.map((value) => ({
  value: String(value),
  label: `${value} messages`,
}));

export function SettingsPage() {
  const [pageSize, setPageSize] = useMailPageSize();

  return (
    <Container py="lg" size="sm">
      <Stack>
        <Title order={3}>Settings</Title>

        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600}>Mail</Text>
            <Select
              label="Messages per page"
              data={pageSizeOptions}
              value={String(pageSize)}
              onChange={(value) => {
                if (value) setPageSize(Number(value) as MailPageSize);
              }}
              w={220}
            />
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
