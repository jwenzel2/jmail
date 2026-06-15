import type { Contact, ContactInput } from '@jmail/shared';
import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Card,
  Center,
  Checkbox,
  Container,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBuilding,
  IconMail,
  IconPencil,
  IconPhone,
  IconPlus,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from '../hooks/useContacts';

const EMPTY_CONTACT: ContactInput = {
  displayName: '',
  email: '',
  phone: null,
  company: null,
  notes: null,
  favorite: false,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function ContactEditor({
  opened,
  contact,
  onClose,
}: {
  opened: boolean;
  contact: Contact | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ContactInput>(EMPTY_CONTACT);
  const create = useCreateContact();
  const update = useUpdateContact();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!opened) return;
    setForm(contact ? { ...contact } : EMPTY_CONTACT);
  }, [opened, contact]);

  const save = () => {
    if (!form.displayName.trim() || !form.email.trim()) {
      notifications.show({ color: 'red', message: 'Name and email are required.' });
      return;
    }
    const options = {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          message: contact ? 'Contact updated.' : 'Contact added.',
        });
        onClose();
      },
      onError: () =>
        notifications.show({
          color: 'red',
          message: 'Could not save contact. The email may already exist.',
        }),
    };
    if (contact) update.mutate({ id: contact.id, patch: form }, options);
    else create.mutate(form, options);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={contact ? 'Edit contact' : 'New contact'}
      size="md"
    >
      <Stack>
        <TextInput
          label="Name"
          required
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.currentTarget.value })}
        />
        <TextInput
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.currentTarget.value })}
        />
        <TextInput
          label="Phone"
          value={form.phone ?? ''}
          onChange={(e) => setForm({ ...form, phone: e.currentTarget.value || null })}
        />
        <TextInput
          label="Company"
          value={form.company ?? ''}
          onChange={(e) => setForm({ ...form, company: e.currentTarget.value || null })}
        />
        <Textarea
          label="Notes"
          autosize
          minRows={3}
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.currentTarget.value || null })}
        />
        <Checkbox
          label="Favorite contact"
          checked={form.favorite}
          onChange={(e) => setForm({ ...form, favorite: e.currentTarget.checked })}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function ContactsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ opened: boolean; contact: Contact | null }>({
    opened: false,
    contact: null,
  });
  const contacts = useContacts(query);
  const update = useUpdateContact();
  const remove = useDeleteContact();
  const list = useMemo(() => contacts.data?.contacts ?? [], [contacts.data]);
  const selected = list.find((contact) => contact.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !list.some((contact) => contact.id === selectedId)) setSelectedId(null);
  }, [list, selectedId]);

  const deleteSelected = () => {
    if (!selected || !window.confirm(`Delete ${selected.displayName}?`)) return;
    remove.mutate(selected.id, {
      onSuccess: () => {
        setSelectedId(null);
        notifications.show({ color: 'green', message: 'Contact deleted.' });
      },
      onError: () => notifications.show({ color: 'red', message: 'Could not delete contact.' }),
    });
  };

  return (
    <Container py="lg" size="xl">
      <Stack>
        <Group justify="space-between">
          <div>
            <Title order={3}>Contacts</Title>
            <Text size="sm" c="dimmed">
              Keep frequently used recipients organized and available in Compose.
            </Text>
          </div>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setEditor({ opened: true, contact: null })}
          >
            New contact
          </Button>
        </Group>

        <Card withBorder p={0} h="calc(100vh - 180px)" mih={480}>
          <Group h="100%" gap={0} align="stretch" wrap="nowrap">
            <Stack
              gap={0}
              w={360}
              style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}
            >
              <Box p="sm">
                <TextInput
                  placeholder="Search contacts"
                  leftSection={<IconSearch size={16} />}
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                />
              </Box>
              <ScrollArea style={{ flex: 1 }}>
                {contacts.isLoading ? (
                  <Center h={180}>
                    <Loader size="sm" />
                  </Center>
                ) : list.length === 0 ? (
                  <Center h={180}>
                    <Text c="dimmed" size="sm">
                      {query ? 'No matching contacts' : 'No contacts yet'}
                    </Text>
                  </Center>
                ) : (
                  list.map((contact) => (
                    <UnstyledButton
                      key={contact.id}
                      onClick={() => setSelectedId(contact.id)}
                      w="100%"
                      p="sm"
                      style={{
                        backgroundColor:
                          contact.id === selectedId
                            ? 'var(--mantine-primary-color-light)'
                            : undefined,
                        borderBottom: '1px solid var(--mantine-color-default-border)',
                      }}
                    >
                      <Group wrap="nowrap">
                        <Avatar radius="xl">{initials(contact.displayName)}</Avatar>
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Group gap={4} wrap="nowrap">
                            <Text fw={600} truncate>
                              {contact.displayName}
                            </Text>
                            {contact.favorite ? (
                              <IconStarFilled size={13} color="var(--mantine-color-yellow-6)" />
                            ) : null}
                          </Group>
                          <Text size="sm" c="dimmed" truncate>
                            {contact.email}
                          </Text>
                        </Box>
                      </Group>
                    </UnstyledButton>
                  ))
                )}
              </ScrollArea>
            </Stack>

            <Box style={{ flex: 1, minWidth: 0 }}>
              {selected ? (
                <Stack p="xl" gap="lg">
                  <Group justify="space-between" align="flex-start">
                    <Group>
                      <Avatar size={72} radius="xl">
                        {initials(selected.displayName)}
                      </Avatar>
                      <div>
                        <Group gap="xs">
                          <Title order={3}>{selected.displayName}</Title>
                          <ActionIcon
                            variant="subtle"
                            color="yellow"
                            aria-label={selected.favorite ? 'Remove favorite' : 'Add favorite'}
                            onClick={() =>
                              update.mutate({
                                id: selected.id,
                                patch: { favorite: !selected.favorite },
                              })
                            }
                          >
                            {selected.favorite ? (
                              <IconStarFilled size={20} />
                            ) : (
                              <IconStar size={20} />
                            )}
                          </ActionIcon>
                        </Group>
                        {selected.company ? <Text c="dimmed">{selected.company}</Text> : null}
                      </div>
                    </Group>
                    <Group gap="xs">
                      <Button
                        leftSection={<IconMail size={16} />}
                        onClick={() => navigate(`/?compose=${encodeURIComponent(selected.email)}`)}
                      >
                        Email
                      </Button>
                      <Button
                        variant="default"
                        leftSection={<IconPencil size={16} />}
                        onClick={() => setEditor({ opened: true, contact: selected })}
                      >
                        Edit
                      </Button>
                      <ActionIcon color="red" variant="subtle" size="lg" onClick={deleteSelected}>
                        <IconTrash size={18} />
                      </ActionIcon>
                    </Group>
                  </Group>

                  <Stack gap="sm">
                    <Group gap="sm">
                      <IconMail size={18} />
                      <Text>{selected.email}</Text>
                    </Group>
                    {selected.phone ? (
                      <Group gap="sm">
                        <IconPhone size={18} />
                        <Text component="a" href={`tel:${selected.phone}`}>
                          {selected.phone}
                        </Text>
                      </Group>
                    ) : null}
                    {selected.company ? (
                      <Group gap="sm">
                        <IconBuilding size={18} />
                        <Text>{selected.company}</Text>
                      </Group>
                    ) : null}
                  </Stack>

                  {selected.notes ? (
                    <Box>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
                        Notes
                      </Text>
                      <Text style={{ whiteSpace: 'pre-wrap' }}>{selected.notes}</Text>
                    </Box>
                  ) : null}
                </Stack>
              ) : (
                <Center h="100%">
                  <Text c="dimmed">Select a contact to view details</Text>
                </Center>
              )}
            </Box>
          </Group>
        </Card>
      </Stack>

      <ContactEditor
        opened={editor.opened}
        contact={editor.contact}
        onClose={() => setEditor((current) => ({ ...current, opened: false }))}
      />
    </Container>
  );
}
