import type { ContactInput, ContactUpdate } from '@jmail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as contacts from '../api/contacts';

export function useContacts(query = '') {
  return useQuery({
    queryKey: ['contacts', query],
    queryFn: () => contacts.getContacts(query),
    staleTime: 60 * 1000,
  });
}

function useInvalidateContacts() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['contacts'] });
}

export function useCreateContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (input: ContactInput) => contacts.createContact(input),
    onSuccess: invalidate,
  });
}

export function useUpdateContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ContactUpdate }) =>
      contacts.updateContact(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({ mutationFn: contacts.deleteContact, onSuccess: invalidate });
}
