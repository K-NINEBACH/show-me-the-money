export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) { if (/^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec)) return next(spec + ".js", ctx); throw e; }
}
