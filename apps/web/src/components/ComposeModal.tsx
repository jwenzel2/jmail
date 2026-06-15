import { Button, Group, Modal, Stack, TagsInput, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useContacts } from '../hooks/useContacts';
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
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const send = useSendMessage();
  const contacts = useContacts();
  const contactOptions = (contacts.data?.contacts ?? []).map((contact) => ({
    value: contact.email,
    label: `${contact.displayName} <${contact.email}>`,
  }));

  // Reset the form whenever a new draft is opened.
  useEffect(() => {
    if (opened) {
      setForm(draft);
      setTo(parseAddresses(draft.to));
      setCc(parseAddresses(draft.cc));
    }
  }, [opened, draft]);

  const submit = () => {
    if (to.length === 0) {
      notifications.show({ color: 'red', message: 'At least one recipient is required.' });
      return;
    }
    send.mutate(
      {
        to,
        cc,
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
        <TagsInput
          label="To"
          placeholder="recipient@example.com, another@example.com"
          data={contactOptions}
          value={to}
          onChange={setTo}
          splitChars={[',', ';']}
          clearable
        />
        <TagsInput
          label="Cc"
          data={contactOptions}
          value={cc}
          onChange={setCc}
          splitChars={[',', ';']}
          clearable
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
