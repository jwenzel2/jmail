import type { LintResult } from '@jmail/shared';
import {
  Alert,
  Badge,
  Button,
  Code,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { applySpamConfig, getAgentHealth, getSpamConfig, validateSpamConfig } from '../../api/admin';

export function AdminSpamPage() {
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ['agentHealth'], queryFn: getAgentHealth, retry: false });
  const config = useQuery({ queryKey: ['spamConfig'], queryFn: getSpamConfig, retry: false });
  const [content, setContent] = useState('');
  const [lint, setLint] = useState<LintResult | null>(null);

  useEffect(() => {
    if (config.data) setContent(config.data.content);
  }, [config.data]);

  const validate = useMutation({
    mutationFn: () => validateSpamConfig(content),
    onSuccess: setLint,
  });

  const apply = useMutation({
    mutationFn: () => applySpamConfig(content),
    onSuccess: (result) => {
      setLint(result);
      if (result.ok) {
        notifications.show({ color: 'green', message: 'Configuration applied and reloaded.' });
        void qc.invalidateQueries({ queryKey: ['spamConfig'] });
      } else {
        notifications.show({ color: 'red', message: 'Lint failed — changes were not applied.' });
      }
    },
    onError: () => notifications.show({ color: 'red', message: 'Failed to apply configuration.' }),
  });

  const agentDown = health.isError;

  return (
    <Container py="lg" size="lg">
      <Stack>
        <Group justify="space-between">
          <Title order={3}>SpamAssassin configuration</Title>
          {health.isLoading ? (
            <Loader size="xs" />
          ) : agentDown ? (
            <Badge color="red">agent offline</Badge>
          ) : (
            <Badge color="green">
              agent ok{health.data?.spamassassinVersion ? ` · ${health.data.spamassassinVersion}` : ''}
            </Badge>
          )}
        </Group>

        {agentDown ? (
          <Alert color="red" title="jmail-agent unreachable">
            The companion agent on the mail host is not responding. Global rules can't be edited until
            it's configured (AGENT_URL / AGENT_TOKEN).
          </Alert>
        ) : null}

        <Text size="sm" c="dimmed">
          Edit the site-wide <Code>local.cf</Code>. "Validate" runs <Code>spamassassin --lint</Code>{' '}
          without applying; "Apply" lints, then writes and reloads only if the lint passes.
        </Text>

        {config.isLoading ? (
          <Loader />
        ) : (
          <Textarea
            autosize
            minRows={16}
            maxRows={30}
            value={content}
            onChange={(e) => setContent(e.currentTarget.value)}
            styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
            disabled={agentDown}
          />
        )}

        {lint ? (
          <Alert color={lint.ok ? 'green' : 'red'} title={lint.ok ? 'Lint passed' : 'Lint failed'}>
            {lint.output ? (
              <Code block>{lint.output}</Code>
            ) : (
              <Text size="sm">No warnings.</Text>
            )}
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => validate.mutate()}
            loading={validate.isPending}
            disabled={agentDown}
          >
            Validate
          </Button>
          <Button onClick={() => apply.mutate()} loading={apply.isPending} disabled={agentDown}>
            Apply &amp; reload
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
