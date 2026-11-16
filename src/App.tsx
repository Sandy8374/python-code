import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { DashboardPage } from './pages/DashboardPage';
import { ProblemsPage } from './pages/ProblemsPage';
import { ConceptsPage } from './pages/ConceptsPage';
import { ProblemDetailPage } from './pages/ProblemDetailPage';
import { PracticeArenaPage } from './pages/PracticeArenaPage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { RevisionsPage } from './pages/RevisionsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { MockInterviewPage } from './pages/MockInterviewPage';
import { DebuggingPage } from './pages/DebuggingPage';
import { OutputPredictionPage } from './pages/OutputPredictionPage';
import { InterviewPrepPage } from './pages/InterviewPrepPage';
import { RoadmapPage } from './pages/RoadmapPage';
import { NotesPage } from './pages/NotesPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/problems/category/:slug" element={<ProblemsPage />} />
            <Route path="/problems/:slug" element={<ProblemDetailPage />} />
            <Route path="/concepts" element={<ConceptsPage />} />
            <Route path="/practice" element={<PracticeArenaPage />} />
            <Route path="/debugging" element={<DebuggingPage />} />
            <Route path="/output-prediction" element={<OutputPredictionPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/mock-interview" element={<MockInterviewPage />} />
            <Route path="/interview-prep" element={<InterviewPrepPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/submissions" element={<SubmissionsPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/revisions" element={<RevisionsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
