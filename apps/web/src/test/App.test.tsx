import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import LandingPage from '../pages/LandingPage';
import NotFoundPage from '../pages/NotFoundPage';

// Test pages in isolation via MemoryRouter (App itself wraps BrowserRouter)
describe('App routing', () => {
  it('renders landing page at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    );
    // Hero heading contains "Forward Deployed Engineer"
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });

  it('renders 404 page for unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/this-does-not-exist']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('404')).toBeDefined();
  });
});
