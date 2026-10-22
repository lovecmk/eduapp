import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../data/network/ApiClient';
import { supportedCardFormats } from '../constants/choiceQuestion';

/** New formats are offered only when the live server advertises support. */
export function useAuthorCardFormats() {
  const { data } = useQuery({
    queryKey: ['author-card-formats'],
    queryFn: () => apiClient.get<{ supported_formats?: string[] }>('/inner/api/v1/admin/studio/capability'),
    staleTime: 60_000,
    retry: false,
  });
  return supportedCardFormats(data?.supported_formats);
}
