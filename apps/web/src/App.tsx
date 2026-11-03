import { CommandProvider, ThemeProvider } from '@free360/ui';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { EditorRoute } from './editor/EditorRoute';
import { GlobalCommands } from './GlobalCommands';
import { HomePage } from './home/HomePage';
import { ServicesProvider, type Services } from './services';

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/:kind/:id', element: <EditorRoute /> },
  { path: '*', element: <HomePage /> },
]);

export function App({ services }: { services: Services }) {
  return (
    <ServicesProvider services={services}>
      <ThemeProvider>
        <CommandProvider registry={services.registry}>
          <GlobalCommands />
          <RouterProvider router={router} />
        </CommandProvider>
      </ThemeProvider>
    </ServicesProvider>
  );
}
