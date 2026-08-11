// =============================================
// CTO-005A (revue CTO §C/§D) — inscription et invitation côté navigateur
//
// Prouve que le client :
//   - n'écrit dans `user_profiles` que des colonnes personnelles (la migration
//     0200 lui refuse email/role/region/circonscription_id) ;
//   - ne construit JAMAIS un rôle privilégié localement : le rôle vient de la
//     réponse de /api/auth/apply-invite, jamais du lien d'invitation ;
//   - ne connecte personne avec un privilège si apply-invite échoue.
// =============================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../Login';

const mockNavigate = jest.fn();
let mockCurrentSearch = '';

// react-router-dom v7 n'expose pas d'entrée CommonJS résolvable par Jest 27 :
// on le remplace par un module virtuel réduit à ce que Login.js consomme.
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(mockCurrentSearch)],
}), { virtual: true });

jest.mock('../../../utils/authLogger', () => ({ logAuth: jest.fn() }));
jest.mock('../../../utils/sessionService', () => ({
  createSession: jest.fn().mockResolvedValue({}),
  getSessionToken: jest.fn().mockReturnValue('sess'),
}));
jest.mock('../../../utils/deviceFingerprint', () => ({
  getDeviceInfo: () => ({ fingerprint: 'fp' }),
  getDeviceFingerprint: () => 'fp',
}));

const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockSignUp = jest.fn();

jest.mock('../../../utils/supabaseClient', () => ({
  __esModule: true,
  default: {
    auth: {
      signUp: (...args) => mockSignUp(...args),
      getSession: jest.fn().mockResolvedValue({ data: {} }),
      signOut: jest.fn().mockResolvedValue({}),
    },
    from: () => ({
      upsert: (...args) => mockUpsert(...args),
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
}));

const SESSION = {
  access_token: 'jwt-verifie',
  user: { id: 'u-1', email: 'invited@example.com', user_metadata: {} },
};

// Réponses HTTP par endpoint ; chaque test ne surcharge que ce qui l'intéresse.
let routes = {};

function mockFetch() {
  global.fetch = jest.fn((url) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    const r = key ? routes[key] : { status: 200, body: { ok: true } };
    return Promise.resolve({
      ok: r.status < 400,
      status: r.status,
      json: () => Promise.resolve(r.body),
    });
  });
}

async function fillSignupForm({ withInvite }) {
  mockCurrentSearch = withInvite ? '?invite=tok-invite' : '';
  render(<Login onLogin={mockOnLogin} />);
  if (withInvite) {
    // Le lien d'invitation bascule automatiquement en mode inscription.
    await waitFor(() => expect(screen.getByPlaceholderText('Jean')).toBeInTheDocument());
  } else {
    fireEvent.click(screen.getByText('Créer un compte'));
    fireEvent.change(screen.getByPlaceholderText('vous@exemple.com'), {
      target: { value: 'invited@example.com' },
    });
  }
  fireEvent.change(screen.getByPlaceholderText('Jean'), { target: { value: 'Jean' } });
  fireEvent.change(screen.getByPlaceholderText('Dupont'), { target: { value: 'Dupont' } });
  fireEvent.change(screen.getByPlaceholderText(/8\+ caractères/), { target: { value: 'Abcdef1!' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'Abcdef1!' } });
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByText('Valider l’inscription'));
}

const mockOnLogin = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockUpsert.mockResolvedValue({ error: null });
  mockSignUp.mockResolvedValue({ data: { user: SESSION.user, session: SESSION }, error: null });
  routes = {
    '/api/invitations/validate': {
      status: 200,
      body: { ok: true, invitation: { email: 'invited@example.com', role: 'teacher', region: 'GP', circonscription_id: null } },
    },
    '/api/auth/apply-invite': { status: 200, body: { ok: true, role: 'teacher', region: 'GP' } },
  };
  mockFetch();
});

test("le profil créé par le navigateur ne contient aucune colonne d'autorité", async () => {
  await fillSignupForm({ withInvite: true });
  await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
  const payload = mockUpsert.mock.calls[0][0];
  expect(Object.keys(payload).sort()).toEqual(['first_name', 'id', 'last_name', 'pseudo']);
  expect(payload.email).toBeUndefined();
  expect(payload.role).toBeUndefined();
  expect(payload.region).toBeUndefined();
  expect(payload.circonscription_id).toBeUndefined();
});

test('inscription sans invitation → rôle user', async () => {
  await fillSignupForm({ withInvite: false });
  await waitFor(() => expect(mockOnLogin).toHaveBeenCalled());
  expect(mockOnLogin.mock.calls[0][0].role).toBe('user');
  const applyCalls = global.fetch.mock.calls.filter((c) => String(c[0]).includes('apply-invite'));
  expect(applyCalls.length).toBe(0);
});

test('invitation teacher → rôle appliqué seulement après succès du backend', async () => {
  await fillSignupForm({ withInvite: true });
  await waitFor(() => expect(mockOnLogin).toHaveBeenCalled());
  const profile = mockOnLogin.mock.calls[0][0];
  expect(profile.role).toBe('teacher');
  expect(profile.region).toBe('GP');
  // Le backend est interrogé AVANT toute navigation.
  const applyCalls = global.fetch.mock.calls.filter((c) => String(c[0]).includes('apply-invite'));
  expect(applyCalls.length).toBe(1);
  expect(applyCalls[0][1].headers.Authorization).toBe(`Bearer ${SESSION.access_token}`);
  expect(mockNavigate).toHaveBeenCalled();
});

test('invitation rectorat → rôle issu du serveur, jamais du lien', async () => {
  routes['/api/invitations/validate'].body.invitation.role = 'teacher';
  routes['/api/auth/apply-invite'] = { status: 200, body: { ok: true, role: 'rectorat', region: 'GP' } };
  await fillSignupForm({ withInvite: true });
  await waitFor(() => expect(mockOnLogin).toHaveBeenCalled());
  expect(mockOnLogin.mock.calls[0][0].role).toBe('rectorat');
});

test('apply-invite refusé → aucun privilège local, aucune navigation', async () => {
  routes['/api/auth/apply-invite'] = { status: 403, body: { error: 'invite_email_mismatch' } };
  await fillSignupForm({ withInvite: true });
  await waitFor(() =>
    expect(screen.getByText(/invitation a été émise pour une autre adresse/i)).toBeInTheDocument()
  );
  expect(mockOnLogin).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(localStorage.getItem('cc_auth')).toBeNull();
});

test('apply-invite en panne serveur → aucun privilège local, token conservé pour retry', async () => {
  routes['/api/auth/apply-invite'] = { status: 503, body: { error: 'invitation_consume_failed' } };
  await fillSignupForm({ withInvite: true });
  await waitFor(() =>
    expect(screen.getByText(/invitation n'a pas pu être appliquée/i)).toBeInTheDocument()
  );
  expect(mockOnLogin).not.toHaveBeenCalled();
  expect(localStorage.getItem('cc_pending_invite')).toBe('tok-invite');
});
