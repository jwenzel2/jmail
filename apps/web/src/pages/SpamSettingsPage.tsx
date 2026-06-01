import type { SenderListEntry } from '@jmail/shared';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { getSpamSettings, updateSpamLists } from '../api/spam';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed" tt="uppercase">
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </Card>
  );
}

export function SpamSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['spamSettings'],
    queryFn: getSpamSettings,
  });
  const [entries, setEntries] = useState<SenderListEntry[]>([]);
  const [pattern, setPattern] = useState('');
  const [list, setList] = useState<'allow' | 'block'>('allow');

  useEffect(() => {
    if (data) setEntries(data.entries);
  }, [data]);

  const save = useMutation({
    mutationFn: () => updateSpamLists(entries),
    onSuccess: () => {
      notifications.show({ color: 'green', message: 'Spam lists saved.' });
      void qc.invalidateQueries({ queryKey: ['spamSettings'] });
    },
    onError: () => notifications.show({ color: 'red', message: 'Failed to save.' }),
  });

  if (isLoading) {
    return (
      <Container py="xl">
        <Loader />
      </Container>
    );
  }

  if (isError || !data) {
    return (
      <Container py="xl">
        <Alert color="red" title="Spam settings unavailable">
          Could not reach the spam filter. The jmail-agent may not be configured yet.
        </Alert>
      </Container>
    );
  }

  const addEntry = () => {
    if (!pattern.trim()) return;
    setEntries((e) => [...e, { pattern: pattern.trim(), list }]);
    setPattern('');
  };

  return (
    <Container py="lg" size="md">
      <Stack>
        <Title order={3}>Spam settings</Title>

        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Stat label="Learned spam" value={data.bayes.nSpam} />
          <Stat label="Learned ham" value={data.bayes.nHam} />
          <Stat label="Tokens" value={data.bayes.nTokens} />
          <Card withBorder padding="sm">
            <Text size="xs" c="dimmed" tt="uppercase">
              Filter
            </Text>
            <Badge color={data.bayes.trained ? 'green' : 'yellow'} mt={4}>
              {data.bayes.trained ? 'Trained' : 'Learning'}
            </Badge>
          </Card>
        </SimpleGrid>

        <Text size="sm" c="dimmed">
          Mark messages as spam (move to Junk) to train the filter. Add senders below to always allow
          or always block them.
        </Text>

        <Card withBorder>
          <Group align="flex-end">
            <TextInput
              label="Sender pattern"
              placeholder="user@example.com or *@example.com"
              value={pattern}
              onChange={(e) => setPattern(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              label="List"
              data={[
                { value: 'allow', label: 'Allow' },
                { value: 'block', label: 'Block' },
              ]}
              value={list}
              onChange={(v) => setList((v as 'allow' | 'block') ?? 'allow')}
              w={120}
            />
            <Button onClick={addEntry}>Add</Button>
          </Group>

          <Table mt="md" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Pattern</Table.Th>
                <Table.Th w={100}>List</Table.Th>
                <Table.Th w={60} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entries.map((e, i) => (
                <Table.Tr key={`${e.list}-${e.pattern}-${i}`}>
                  <Table.Td>{e.pattern}</Table.Td>
                  <Table.Td>
                    <Badge color={e.list === 'allow' ? 'green' : 'red'} variant="light">
                      {e.list}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
              {entries.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text c="dimmed" size="sm" ta="center">
                      No allow/block rules yet
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>

          <Group justify="flex-end" mt="md">
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Save lists
            </Button>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
}
