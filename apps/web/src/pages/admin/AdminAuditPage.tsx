import { Badge, Container, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getAudit } from '../../api/admin';
import { formatFullDate } from '../../utils/format';

export function AdminAuditPage() {
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: getAudit });

  return (
    <Container py="lg" size="lg">
      <Stack>
        <Title order={3}>Audit log</Title>
        {isLoading ? (
          <Loader />
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={180}>When</Table.Th>
                <Table.Th w={140}>Who</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th w={90}>Result</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.entries ?? []).map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td>{formatFullDate(e.createdAt)}</Table.Td>
                  <Table.Td>{e.userEmail ?? '—'}</Table.Td>
                  <Table.Td>
                    {e.action}
                    {e.target ? <Text span c="dimmed"> · {e.target}</Text> : null}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={e.result === 'ok' ? 'green' : 'red'} variant="light">
                      {e.result}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
              {(data?.entries.length ?? 0) === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text c="dimmed" ta="center" size="sm">
                      No audit entries yet
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
