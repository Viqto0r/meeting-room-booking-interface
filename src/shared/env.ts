/** Mock API (MSW) and the dev panel are on unless `VITE_USE_MOCKS=false`. */
export const MOCKS_ENABLED = import.meta.env.VITE_USE_MOCKS !== 'false'
