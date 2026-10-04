import type { Instrumentation } from 'next';

// Any uncaught error in a page, server action or API route on the server reaches the platform admin.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportError } = await import('@/lib/alerts');
  const path = request.path.split('?')[0];
  await reportError('server', err, { path, method: request.method, route: context.routePath, type: context.routeType }, context.routePath);
};
