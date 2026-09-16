import { test } from 'node:test';
import assert from 'node:assert/strict';
import { azureChatUrl, AI_PROVIDERS, AI_PROVIDER_IDS } from '../lib/ai-provider';

// Azure non dà un endpoint, dà una risorsa: nel portale la stessa cosa compare
// scritta in quattro modi diversi e l'utente incolla quello che trova. Tutti
// devono finire sulla stessa URL v1, che non vuole più api-version.
test('la URL Azure si normalizza da qualunque forma incollata', () => {
  const atteso = 'https://my-res.openai.azure.com/openai/v1/chat/completions';
  for (const incollato of [
    'https://my-res.openai.azure.com',
    'https://my-res.openai.azure.com/',
    'https://my-res.openai.azure.com/openai',
    'https://my-res.openai.azure.com/openai/v1',
    'https://my-res.openai.azure.com/openai/v1/',
    'https://my-res.openai.azure.com/openai/v1/chat/completions',
    '  https://my-res.openai.azure.com/  ',
  ]) {
    assert.equal(azureChatUrl(incollato), atteso, `fallito su: ${incollato}`);
  }
});

test('vale anche per il dominio services.ai.azure.com', () => {
  assert.equal(
    azureChatUrl('https://my-res.services.ai.azure.com'),
    'https://my-res.services.ai.azure.com/openai/v1/chat/completions',
  );
});

test('il provider Azure è registrato e usa l\'header api-key', () => {
  assert.ok(AI_PROVIDER_IDS.includes('azure'));
  const def = AI_PROVIDERS.azure;
  assert.equal(def.authHeader, 'api-key');
  assert.equal(def.endpointEnv, 'AZURE_OPENAI_ENDPOINT');
  assert.equal(def.keyEnv, 'AZURE_OPENAI_API_KEY');
  assert.equal(def.endpoint, undefined, 'endpoint per tenant, non fisso');
});

test('gli altri provider restano a bearer, non si tocca quello che funziona', () => {
  assert.equal(AI_PROVIDERS.openai.authHeader, undefined);
  assert.equal(AI_PROVIDERS.grok.authHeader, undefined);
  assert.equal(AI_PROVIDERS.openai.endpoint, 'https://api.openai.com/v1/chat/completions');
});
