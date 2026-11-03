import { createCommandRegistry } from '@free360/commands';
import type { DocRepository } from '@free360/core';
import { createDexieRepository } from '@free360/storage';
import { createContext, useContext, type ReactNode } from 'react';

export type Services = {
  repo: DocRepository;
  registry: ReturnType<typeof createCommandRegistry>;
};

export function createServices(): Services {
  return { repo: createDexieRepository(), registry: createCommandRegistry() };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useRepo(): DocRepository {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useRepo must be used inside <ServicesProvider>');
  return services.repo;
}
