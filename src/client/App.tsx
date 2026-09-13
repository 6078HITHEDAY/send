import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate
} from 'react-router-dom';
import type { TranslateFn } from '../core/utils.ts';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { useDropAndPaste } from './hooks/useDropAndPaste.ts';
import { useTransferTitle } from './hooks/useTransferTitle.ts';
import { TranslateProvider } from './i18n/context.tsx';
import { Blank } from './pages/Blank.tsx';
import { Download } from './pages/Download.tsx';
import { ErrorPage } from './pages/ErrorPage.tsx';
import { Home } from './pages/Home.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { OAuth } from './pages/OAuth.tsx';
import { Unsupported } from './pages/Unsupported.tsx';
import { useStore } from './store.ts';

/** Hands React Router's navigate to the store, which is outside the tree. */
function NavigationBridge() {
  const navigate = useNavigate();
  const setNavigate = useStore(s => s.setNavigate);

  useEffect(() => {
    setNavigate((to, options) => navigate(to, options));
  }, [navigate, setNavigate]);

  return null;
}

function Shell() {
  const checkFiles = useStore(s => s.checkFiles);
  useDropAndPaste();
  useTransferTitle();

  useEffect(() => {
    checkFiles();
  }, [checkFiles]);

  return (
    <>
      <NavigationBridge />
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        {/*
          Only the id is a route parameter. The old app also registered
          `/download/:id/:key`, which let choo's hash routing fold the secret
          key into the path; it is read from the fragment instead.
        */}
        <Route path="/download/:id" element={<Download />} />
        <Route path="/unsupported/:reason" element={<Unsupported />} />
        <Route path="/error" element={<ErrorPage />} />
        <Route path="/blank" element={<Blank />} />
        <Route path="/oauth" element={<OAuth />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </>
  );
}

export function App({ translate }: { translate: TranslateFn }) {
  return (
    <TranslateProvider translate={translate}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </TranslateProvider>
  );
}
