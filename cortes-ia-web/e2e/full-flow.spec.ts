import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';

const mailpit = process.env.MAILPIT_URL || 'http://127.0.0.1:8025';

async function waitForConfirmationUrl(email: string) {
  const query = encodeURIComponent(`to:${email}`);
  for (let attempt = 0; attempt < 45; attempt++) {
    const response = await fetch(`${mailpit}/view/latest.txt?query=${query}`);
    if (response.ok) {
      const body = await response.text();
      const match = body.match(/https?:\/\/localhost:3000\/verify\?[^\s]+/);
      if (match) return match[0].replaceAll('&amp;', '&');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Confirmation email did not arrive in Mailpit');
}

function makeVideo() {
  const directory = path.resolve('test-results');
  mkdirSync(directory, {recursive: true});
  const output = path.join(directory, 'sliceflow-e2e.mp4');
  execFileSync('ffmpeg', [
    '-v','error','-y',
    '-f','lavfi','-i','testsrc2=size=640x360:rate=24',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=16000',
    '-t','6',
    '-c:v','libx264','-pix_fmt','yuv420p',
    '-c:a','aac','-threads','2',
    output,
  ]);
  return output;
}

async function refreshUntil(page: Page, predicate: () => Promise<boolean>, attempts = 45) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await predicate()) return;
    const refresh = page.getByRole('button', {name: 'Atualizar'});
    if (await refresh.count()) await refresh.click();
    await page.waitForTimeout(1500);
  }
  throw new Error('Condition was not reached before timeout');
}

test('cadastro até exportação final usa browser, API, worker e storage reais', async ({page, request}) => {
  const suffix = Date.now();
  const email = `e2e-${suffix}@example.test`;
  const password = 'SliceFlow!2026E2E';
  const video = makeVideo();

  await page.goto('/register');
  await page.getByLabel('Nome').fill('Teste E2E SliceFlow');
  await page.getByLabel('Telefone').fill('11999999999');
  await page.getByLabel('CPF').fill('52998224725');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name: 'Criar conta'}).click();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');

  const confirmation = await waitForConfirmationUrl(email);
  await page.goto(confirmation);
  await page.getByRole('button', {name: 'Confirmar'}).click();
  await expect(page.getByRole('status')).toContainText('E-mail confirmado');

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', {name: 'Entrar'}).click();
  await page.waitForURL('**/app');

  await expect(page.getByText('10', {exact: true}).first()).toBeVisible();

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(video);
  await page.waitForURL(/\/app\/projects\/[0-9a-f-]+$/i, {timeout: 60_000});

  const calculate = page.getByRole('button', {name: 'Calcular créditos'});
  await refreshUntil(page, async () => !(await calculate.isDisabled()));
  await calculate.click();

  await expect(page.getByText('Total')).toBeVisible();
  await page.getByLabel('Tenho autorização para processar este conteúdo.').check();
  await page.getByRole('button', {name: /Gerar cortes por 10 créditos/}).click();
  await expect(page.getByRole('status')).toContainText('Processamento iniciado');

  const fixtureClip = page.getByText('Corte demonstrativo local', {exact: true}).first();
  await refreshUntil(page, async () => await fixtureClip.isVisible().catch(() => false), 70);
  await expect(fixtureClip).toBeVisible();

  await page.getByLabel('Escolha').selectOption('SELECTED');
  await page.getByRole('button', {name: 'Salvar nova revisão'}).click();
  await expect(page.getByRole('status')).toContainText(/Revisão \d+ salva/);

  const exportButton = page.getByRole('button', {name: 'Exportar 9:16'});
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  await expect(page.getByRole('status')).toContainText('Renderização 9:16 solicitada');

  const download = page.getByRole('link', {name: 'Baixar vídeo'}).first();
  await expect(download).toBeVisible({timeout: 120_000});

  const href = await download.getAttribute('href');
  expect(href).toBeTruthy();
  const response = await request.get(href!);
  expect(response.ok()).toBeTruthy();
  expect((await response.body()).byteLength).toBeGreaterThan(1000);
});
