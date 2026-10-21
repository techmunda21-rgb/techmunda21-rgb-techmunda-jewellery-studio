'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const useAiStatus = () => useQuery({ queryKey: ['ai-status'], queryFn: () => api<any>('/ai/status'), staleTime: 60_000 });
export const useTeam = () => useQuery({ queryKey: ['team'], queryFn: () => api<{ data: Array<{ id: string; fullName: string; email: string; role: string }> }>('/users'), staleTime: 120_000 });
export const useIntegrationStatus = () => useQuery({ queryKey: ['integrations-status'], queryFn: () => api<any>('/integrations/status'), staleTime: 15_000 });
