// frontend/src/hooks/bots/botControlCard/botControlCard.api.js

import { apiGet, apiPost } from "../../../lib/api/botApi.js";
import { isNotFoundError } from "./botControlCard.helpers.js";

export async function apiGetWithFallback(paths, params, options) {
  let lastErr = null;

  for (const path of paths) {
    try {
      return await apiGet(path, params, options);
    } catch (err) {
      lastErr = err;
      if (!isNotFoundError(err)) break;
    }
  }

  throw lastErr;
}

export async function apiPostWithFallback(paths, body, options) {
  let lastErr = null;

  for (const path of paths) {
    try {
      return await apiPost(path, body, options);
    } catch (err) {
      lastErr = err;
      if (!isNotFoundError(err)) break;
    }
  }

  throw lastErr;
}