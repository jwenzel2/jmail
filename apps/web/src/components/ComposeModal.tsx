import { Button, Group, Modal, Stack, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useSendMessage } from '../hooks/useMail';

export interface ComposeDraft {
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyToUid: number | null;
  inReplyToFolder: string | null;
}

export const EMPTY_DRAFT: ComposeDraft = {
  to: '',
  cc: '',
  subject: '',
  body: '',
  inReplyToUid: null,
  inReplyToFolder: null,
};

function parseAddresses(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ComposeModal({
  opened,
  draft,
  onClose,
}: {
  opened: boolean;
  draft: ComposeDraft;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ComposeDraft>(draft);
  const send = useSendMessage();

  // Reset the form whenever a new draft is opened.
  useEffect(() => {
    if (opened) setForm(draft);
  }, [opened, draft]);

  const submit = () => {
    const to = parseAddresses(form.to);
    if (to.length === 0) {
      notifications.show({ color: 'red', message: 'At least one recipient is required.' });
      return;
    }
    send.mutate(
      {
        to,
        cc: parseAddresses(form.cc),
        bcc: [],
        subject: form.subject,
        text: form.body,
        html: null,
        inReplyToUid: form.inReplyToUid,
        inReplyToFolder: form.inReplyToFolder,
      },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: 'Message sent.' });
          onClose();
        },
        onError: () => notifications.show({ color: 'red', message: 'Failed to send message.' }),
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New message" size="lg">
      <Stack>
        <TextInput
          label="To"
          placeholder="recipient@example.com, another@example.com"
          value={form.to}
          onChange={(e) => setForm({ ...form, to: e.currentTarget.value })}
        />
        <TextInput
          label="Cc"
          value={form.cc}
          onChange={(e) => setForm({ ...form, cc: e.currentTarget.value })}
        />
        <TextInput
          label="Subject"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.currentTarget.value })}
        />
        <Textarea
          label="Message"
          autosize
          minRows={10}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.currentTarget.value })}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={send.isPending}>
            Send
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
