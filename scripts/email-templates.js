// Email templates — Flat White Index
// Usage: import { welcomeEmail, weeklyDigestEmail, milestoneEmail } from './email-templates.js';
// Each function returns { subject: string, html: string }

const BRAND = {
  espresso: '#2C1A0E',
  cream: '#F7F3ED',
  bronze: '#8E5A28',
  ocean: '#2E6B8A',
  green: '#3A7D44',
  muted: '#8B7355',
  danger: '#C0392B',
  url: 'https://flatwhiteindex.com.au',
};

// ─── Shared components ───────────────────────────────────────────────

function emailShell({ preheader, body }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Flat White Index</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 12px !important; }
      .hero-price { font-size: 40px !important; }
      .side-by-side { display: block !important; width: 100% !important; }
      .side-by-side td { display: block !important; width: 100% !important; padding-bottom: 12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;font-size:1px;color:${BRAND.cream};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}${'&nbsp;&zwnj;'.repeat(30)}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.cream};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!-- Container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="max-width:600px;width:100%;">
          ${body}
        </table>
        <!-- /Container -->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function header() {
  return `<tr>
  <td style="background-color:${BRAND.espresso};border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" style="font-size:40px;line-height:1;padding-bottom:8px;">&#9749;</td></tr>
      <tr><td align="center" style="color:${BRAND.cream};font-size:22px;font-weight:700;padding-bottom:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Flat White Index</td></tr>
      <tr><td align="center" style="color:${BRAND.bronze};font-size:12px;letter-spacing:2px;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Sydney's live coffee price tracker</td></tr>
    </table>
  </td>
</tr>`;
}

function button(text, href = BRAND.url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
  <tr>
    <td style="border-radius:10px;background-color:${BRAND.espresso};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 36px;color:${BRAND.cream};text-decoration:none;font-size:14px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

function footer() {
  return `<tr>
  <td style="background-color:${BRAND.espresso};border-radius:0 0 16px 16px;padding:24px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" style="color:rgba(247,243,237,0.6);font-size:12px;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <a href="${BRAND.url}" style="color:${BRAND.bronze};text-decoration:none;">flatwhiteindex.com.au</a><br>
        Part of <a href="https://agenticconsciousness.com.au" style="color:${BRAND.bronze};text-decoration:none;">Agentic Consciousness</a><br><br>
        <a href="{{UNSUBSCRIBE_URL}}" style="color:rgba(247,243,237,0.4);text-decoration:underline;font-size:11px;">Unsubscribe</a>
      </td></tr>
    </table>
  </td>
</tr>`;
}

function spacer(height = 2) {
  return `<tr><td style="height:${height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

function card(content) {
  return `<tr>
  <td style="background-color:#FFFFFF;padding:24px;border-left:1px solid rgba(44,26,14,0.06);border-right:1px solid rgba(44,26,14,0.06);">
    ${content}
  </td>
</tr>`;
}


// ─── Email 1: Welcome ────────────────────────────────────────────────

/**
 * @param {Object} data
 * @param {number} data.avgPrice - Current Sydney average (e.g. 4.85)
 * @param {number} [data.totalCafes] - Total cafes found
 * @param {number} [data.totalPrices] - Total prices collected
 * @returns {{ subject: string, html: string }}
 */
export function welcomeEmail(data) {
  const avg = typeof data.avgPrice === 'number' ? data.avgPrice.toFixed(2) : '?.??';
  const subject = "You're in \u2615 Welcome to the Flat White Index";

  const html = emailShell({
    preheader: `The average Sydney flat white is $${avg}. Here's what you'll get every week.`,
    body: `
      ${header()}
      ${spacer()}

      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-size:16px;color:${BRAND.espresso};line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 16px;">G'day! Welcome aboard.</p>
            <p style="margin:0 0 16px;">You've just signed up for Sydney's most obsessive coffee price tracker. We're using an AI voice agent to ring <strong>every cafe in Sydney</strong> and ask one simple question: <em>"How much is a flat white?"</em></p>
          </td></tr>
        </table>
      `)}

      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="padding:8px 0 4px;">
            <div style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Current Sydney Average</div>
          </td></tr>
          <tr><td align="center" style="padding:4px 0 12px;">
            <div class="hero-price" style="font-size:52px;font-weight:800;color:${BRAND.espresso};line-height:1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">$${avg}</div>
          </td></tr>
          ${data.totalCafes ? `<tr><td align="center" style="font-size:13px;color:${BRAND.muted};padding-bottom:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            Across ${data.totalCafes} cafes${data.totalPrices ? ` &middot; ${data.totalPrices} prices collected` : ''}
          </td></tr>` : ''}
        </table>
      `)}

      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-size:14px;font-weight:600;color:${BRAND.espresso};padding-bottom:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            What you'll get from us:
          </td></tr>
          <tr><td style="font-size:14px;color:${BRAND.espresso};line-height:1.8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <span style="color:${BRAND.green};font-weight:700;">&#10003;</span>&ensp;Weekly price updates &mdash; every Monday morning<br>
            <span style="color:${BRAND.green};font-weight:700;">&#10003;</span>&ensp;Suburb rankings &mdash; cheapest to dearest<br>
            <span style="color:${BRAND.green};font-weight:700;">&#10003;</span>&ensp;Best finds &mdash; the cafes doing it right<br>
            <span style="color:${BRAND.green};font-weight:700;">&#10003;</span>&ensp;Milestones &mdash; as we map more of Sydney
          </td></tr>
        </table>
      `)}

      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="padding:8px 0 16px;">
            ${button('See the live dashboard')}
          </td></tr>
          <tr><td align="center" style="font-size:13px;color:${BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            No spam, ever. Just coffee data.
          </td></tr>
        </table>
      `)}

      ${spacer()}
      ${footer()}
    `,
  });

  return { subject, html };
}


// ─── Email 2: Weekly Digest ──────────────────────────────────────────

/**
 * @param {Object} data
 * @param {number} data.avgPrice - Average flat white price
 * @param {number} data.pricesCollected - Total prices this dataset
 * @param {number} data.totalCalls - Total calls made
 * @param {number} data.totalCafes - Total cafes in DB
 * @param {{ name: string, suburb: string, price: number }|null} data.cheapest
 * @param {{ name: string, suburb: string, price: number }|null} data.dearest
 * @param {{ name: string, avg: number, count: number }[]} data.topSuburbs - Top 5 cheapest
 * @param {{ name: string, count: number }[]} [data.newSuburbs] - Suburbs added this week
 * @returns {{ subject: string, html: string }}
 */
export function weeklyDigestEmail(data) {
  const avg = typeof data.avgPrice === 'number' ? data.avgPrice.toFixed(2) : '?.??';
  const date = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const subject = `\u2615 This week: Sydney's avg flat white is $${avg}`;

  // Build cheapest/dearest side-by-side (stacks on mobile)
  let extremesRow = '';
  if (data.cheapest && data.dearest) {
    extremesRow = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="side-by-side">
        <tr>
          <td width="49%" valign="top" style="padding-right:6px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:rgba(58,125,68,0.06);border-radius:10px;">
              <tr><td style="padding:16px;">
                <div style="font-size:11px;color:${BRAND.green};text-transform:uppercase;letter-spacing:1px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Cheapest</div>
                <div style="font-size:24px;font-weight:800;color:${BRAND.green};padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">$${data.cheapest.price.toFixed(2)}</div>
                <div style="font-size:13px;color:${BRAND.espresso};font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.cheapest.name}</div>
                <div style="font-size:11px;color:${BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.cheapest.suburb}</div>
              </td></tr>
            </table>
          </td>
          <td width="2%" style="font-size:0;">&nbsp;</td>
          <td width="49%" valign="top" style="padding-left:6px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:rgba(192,57,43,0.06);border-radius:10px;">
              <tr><td style="padding:16px;">
                <div style="font-size:11px;color:${BRAND.danger};text-transform:uppercase;letter-spacing:1px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Dearest</div>
                <div style="font-size:24px;font-weight:800;color:${BRAND.danger};padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">$${data.dearest.price.toFixed(2)}</div>
                <div style="font-size:13px;color:${BRAND.espresso};font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.dearest.name}</div>
                <div style="font-size:11px;color:${BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.dearest.suburb}</div>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>`;
  }

  // Build suburb ranking table
  let suburbTable = '';
  if (data.topSuburbs && data.topSuburbs.length > 0) {
    const rows = data.topSuburbs.map((s, i) => `
      <tr>
        <td style="padding:10px 0;${i < data.topSuburbs.length - 1 ? `border-bottom:1px solid rgba(44,26,14,0.06);` : ''}font-size:13px;color:${BRAND.espresso};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <span style="display:inline-block;width:20px;color:${BRAND.muted};font-weight:600;">${i + 1}.</span>
          ${s.name} <span style="color:${BRAND.muted};font-size:11px;">(${s.count})</span>
        </td>
        <td align="right" style="padding:10px 0;${i < data.topSuburbs.length - 1 ? `border-bottom:1px solid rgba(44,26,14,0.06);` : ''}font-size:14px;font-weight:700;color:${BRAND.green};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          $${s.avg.toFixed(2)}
        </td>
      </tr>`).join('');

    suburbTable = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="font-size:14px;font-weight:700;color:${BRAND.espresso};padding-bottom:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          Top 5 Cheapest Suburbs
        </td></tr>
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${rows}
          </table>
        </td></tr>
      </table>`;
  }

  // New suburbs section
  let newSuburbsSection = '';
  if (data.newSuburbs && data.newSuburbs.length > 0) {
    const tags = data.newSuburbs.map(s =>
      `<span style="display:inline-block;background-color:rgba(46,107,138,0.1);color:${BRAND.ocean};font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;margin:3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${s.name}</span>`
    ).join(' ');

    newSuburbsSection = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding-top:16px;border-top:1px solid rgba(44,26,14,0.06);">
          <div style="font-size:13px;font-weight:600;color:${BRAND.ocean};padding-bottom:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            New suburbs this week
          </div>
          <div>${tags}</div>
        </td></tr>
      </table>`;
  }

  const html = emailShell({
    preheader: `Sydney avg: $${avg} | Cheapest: ${data.cheapest ? `$${data.cheapest.price.toFixed(2)} at ${data.cheapest.name}` : 'TBD'} | ${data.pricesCollected || 0} prices collected`,
    body: `
      ${header()}
      ${spacer()}

      <!-- Hero price -->
      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="padding:4px 0;">
            <div style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${date}</div>
          </td></tr>
          <tr><td align="center" style="padding:8px 0;">
            <div class="hero-price" style="font-size:52px;font-weight:800;color:${BRAND.espresso};line-height:1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">$${avg}</div>
          </td></tr>
          <tr><td align="center" style="padding:4px 0 16px;">
            <div style="font-size:14px;color:${BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Average Sydney flat white</div>
          </td></tr>

          <!-- Stats row -->
          <tr><td>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid rgba(44,26,14,0.08);">
              <tr>
                <td width="33%" align="center" style="padding:14px 0;">
                  <div style="font-size:22px;font-weight:700;color:${BRAND.espresso};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.pricesCollected || 0}</div>
                  <div style="font-size:10px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Prices</div>
                </td>
                <td width="34%" align="center" style="padding:14px 0;border-left:1px solid rgba(44,26,14,0.06);border-right:1px solid rgba(44,26,14,0.06);">
                  <div style="font-size:22px;font-weight:700;color:${BRAND.espresso};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.totalCalls || 0}</div>
                  <div style="font-size:10px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Calls made</div>
                </td>
                <td width="33%" align="center" style="padding:14px 0;">
                  <div style="font-size:22px;font-weight:700;color:${BRAND.espresso};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${data.totalCafes || 0}</div>
                  <div style="font-size:10px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Cafes</div>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      `)}

      <!-- Cheapest / Dearest -->
      ${extremesRow ? card(extremesRow) : ''}

      <!-- Suburb rankings -->
      ${suburbTable ? card(suburbTable + newSuburbsSection) : ''}

      <!-- CTA -->
      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="padding:8px 0;">
            ${button('Explore the full dashboard')}
          </td></tr>
        </table>
      `)}

      ${spacer()}
      ${footer()}
    `,
  });

  return { subject, html };
}


// ─── Email 3: Milestone ──────────────────────────────────────────────

/**
 * @param {Object} data
 * @param {number} data.milestone - The milestone hit (100, 500, 1000, etc.)
 * @param {number} data.avgPrice - Current average
 * @param {number} data.minPrice - Lowest price found
 * @param {number} data.maxPrice - Highest price found
 * @param {{ name: string, avg: number }} [data.cheapestSuburb]
 * @param {{ name: string, avg: number }} [data.dearestSuburb]
 * @param {string} [data.insight] - Key insight at this scale
 * @param {number} [data.totalCallMinutes] - Approx minutes spent on calls
 * @returns {{ subject: string, html: string }}
 */
export function milestoneEmail(data) {
  const avg = typeof data.avgPrice === 'number' ? data.avgPrice.toFixed(2) : '?.??';
  const milestone = data.milestone || 0;
  const nextMilestone = milestone < 500 ? 500 : milestone < 1000 ? 1000 : milestone < 5000 ? 5000 : 10000;
  const callHours = data.totalCallMinutes ? Math.round(data.totalCallMinutes / 60 * 10) / 10 : null;
  const subject = `We just hit ${milestone.toLocaleString()} prices \u2615 Here's what we found`;

  const insight = data.insight || `At ${milestone.toLocaleString()} prices, the data is getting seriously interesting. Sydney's flat white ranges from $${(data.minPrice || 0).toFixed(2)} to $${(data.maxPrice || 0).toFixed(2)} \u2014 that's a ${((data.maxPrice || 0) - (data.minPrice || 0)).toFixed(2)} spread across the city.`;

  // Fun stat
  let funStat = '';
  if (callHours) {
    funStat = `That's roughly ${callHours} hours of phone calls. Our AI agent deserves a flat white of its own.`;
  } else {
    funStat = `That's ${milestone.toLocaleString()} conversations about coffee. Our AI agent is basically a barista at this point.`;
  }

  const html = emailShell({
    preheader: `${milestone.toLocaleString()} flat white prices collected across Sydney. The data is in.`,
    body: `
      ${header()}
      ${spacer()}

      <!-- Celebration hero -->
      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="padding:8px 0;">
            <div style="font-size:56px;line-height:1;">&#127881;</div>
          </td></tr>
          <tr><td align="center" style="padding:8px 0;">
            <div class="hero-price" style="font-size:48px;font-weight:800;color:${BRAND.espresso};line-height:1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${milestone.toLocaleString()}</div>
          </td></tr>
          <tr><td align="center" style="padding:4px 0 8px;">
            <div style="font-size:16px;color:${BRAND.bronze};font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">prices collected</div>
          </td></tr>
          <tr><td align="center" style="padding:0 0 8px;">
            <div style="font-size:14px;color:${BRAND.muted};font-style:italic;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${funStat}</div>
          </td></tr>
        </table>
      `)}

      <!-- Key insight -->
      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-size:13px;font-weight:700;color:${BRAND.ocean};text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            What we've found
          </td></tr>
          <tr><td style="font-size:15px;color:${BRAND.espresso};line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            ${insight}
          </td></tr>
        </table>
      `)}

      <!-- Price range + suburbs -->
      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <!-- Price range bar -->
          <tr><td style="padding-bottom:20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="30%" style="font-size:12px;color:${BRAND.green};font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  $${(data.minPrice || 0).toFixed(2)}
                </td>
                <td width="40%" align="center" style="font-size:12px;color:${BRAND.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  avg $${avg}
                </td>
                <td width="30%" align="right" style="font-size:12px;color:${BRAND.danger};font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  $${(data.maxPrice || 0).toFixed(2)}
                </td>
              </tr>
              <tr><td colspan="3" style="padding-top:6px;">
                <div style="height:8px;background:linear-gradient(to right, ${BRAND.green}, ${BRAND.bronze}, ${BRAND.danger});border-radius:4px;"></div>
              </td></tr>
              <tr>
                <td style="font-size:10px;color:${BRAND.muted};padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Cheapest</td>
                <td>&nbsp;</td>
                <td align="right" style="font-size:10px;color:${BRAND.muted};padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Dearest</td>
              </tr>
            </table>
          </td></tr>

          <!-- Suburb extremes -->
          ${data.cheapestSuburb || data.dearestSuburb ? `
          <tr><td>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid rgba(44,26,14,0.06);">
              ${data.cheapestSuburb ? `
              <tr>
                <td style="padding:12px 0;font-size:13px;color:${BRAND.espresso};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  <span style="color:${BRAND.green};font-weight:700;">Cheapest suburb:</span> ${data.cheapestSuburb.name}
                </td>
                <td align="right" style="padding:12px 0;font-size:14px;font-weight:700;color:${BRAND.green};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  $${data.cheapestSuburb.avg.toFixed(2)} avg
                </td>
              </tr>` : ''}
              ${data.dearestSuburb ? `
              <tr>
                <td style="padding:12px 0;font-size:13px;color:${BRAND.espresso};border-top:1px solid rgba(44,26,14,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  <span style="color:${BRAND.danger};font-weight:700;">Dearest suburb:</span> ${data.dearestSuburb.name}
                </td>
                <td align="right" style="padding:12px 0;font-size:14px;font-weight:700;color:${BRAND.danger};border-top:1px solid rgba(44,26,14,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  $${data.dearestSuburb.avg.toFixed(2)} avg
                </td>
              </tr>` : ''}
            </table>
          </td></tr>` : ''}
        </table>
      `)}

      <!-- Share CTA -->
      ${card(`
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="padding-bottom:12px;">
            <div style="font-size:15px;font-weight:600;color:${BRAND.espresso};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              Help us get to ${nextMilestone.toLocaleString()}
            </div>
            <div style="font-size:13px;color:${BRAND.muted};padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              Share the Flat White Index with a mate who loves coffee data
            </div>
          </td></tr>
          <tr><td align="center" style="padding:8px 0;">
            ${button('Share the dashboard', BRAND.url + '?ref=milestone')}
          </td></tr>
        </table>
      `)}

      ${spacer()}
      ${footer()}
    `,
  });

  return { subject, html };
}
