// Parser for the profile data Modash embeds in its PUBLIC directory pages (JS object literal, no eval).
// Some pages quote strings with backticks, some with double quotes: normalise first, then read with regexes.

const num = (s, k) => {
  const m = s.match(new RegExp(`${k}:(-?[\\d.e+-]+|!0|!1|null)`));
  if (!m || m[1] === 'null') return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
};
const str = (s, k) => {
  const m = s.match(new RegExp(`${k}:"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1] : null;
};

const BT = String.fromCharCode(96);
const BT_RE = new RegExp(`${BT}((?:[^${BT}\\\\]|\\\\.)*)${BT}`, 'g');
export const normQuotes = txt => txt.replace(BT_RE, (_, inner) => '"' + inner.replace(/\\"/g, '"').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"');

export function parseProfiles(rawHtml) {
  const startRaw = rawHtml.search(new RegExp(`profiles:\\[\\{id:["${BT}][0-9a-f]{24}["${BT}]`));
  if (startRaw < 0) return [];
  const body = normQuotes(rawHtml.slice(startRaw, startRaw + 6_000_000));
  const parts = body.split(/(?=\{id:"[0-9a-f]{24}",fullName:)/).slice(1);
  return parts.map(p => {
    const username = str(p, 'username');
    if (!username) return null;
    const bio = str(p, 'bio');
    const cities = [...(p.match(/audienceCities:\[([^\]]*)\]/)?.[1] || '').matchAll(/\{name:"([^"]+)",weight:([\d.e-]+)\}/g)].map(m => ({ name: m[1], pct: +(Number(m[2]) * 100).toFixed(2) }));
    const countries = [...(p.match(/audienceCountries:\[([^\]]*)\]/)?.[1] || '').matchAll(/\{code:"([A-Z]{2})",name:"([^"]+)",weight:([\d.e-]+)\}/g)].map(m => ({ code: m[1], name: m[2], pct: +(Number(m[3]) * 100).toFixed(2) }));
    const gender = [...(p.match(/genderSplit:\[([^\]]*)\]/)?.[1] || '').matchAll(/\{label:"(\w+)",value:([\d.e-]+)\}/g)].map(m => ({ label: m[1], pct: +(Number(m[2]) * 100).toFixed(2) }));
    const fot = [...(p.match(/followersOverTime:\[([^\]]*)\]/)?.[1] || '').matchAll(/\{date:"([\d-]+)",value:(\d+)\}/g)].map(m => ({ date: m[1], followers: +m[2] }));
    const recentBlock = p.match(/engagementForRecentPosts:\[([\s\S]*?)\],followersEngagementRateHistogram/)?.[1] || '';
    const recent = [...recentBlock.matchAll(/\["([A-Za-z]{3} \d{1,2}, \d{4})"/g)].map(m => new Date(m[1] + ' UTC').toISOString().slice(0, 10));
    const popBlock = p.match(/popularPosts:\[([\s\S]*?)\],popularReels:/)?.[1] || '';
    const popular = [...popBlock.matchAll(/\{title:"((?:[^"\\]|\\.)*)",date:"([^"]*)",likes:(\d+),commentsCount:(\d+),pictureUrl:"[^"]*",url:"([^"]+)",type:"(\w+)"/g)]
      .map(m => ({ caption: m[1].replace(/\\"/g, '"').slice(0, 400), date: m[2] ? m[2].slice(0, 10) : null, likes: +m[3], comments: +m[4], url: m[5], type: m[6] }));
    const reelBlock = p.match(/popularReels:\[([\s\S]*?)\],relatedProfiles:/)?.[1] || '';
    const reels = [...reelBlock.matchAll(/\{title:"((?:[^"\\]|\\.)*)",date:"([^"]*)"[^}]*?url:"([^"]+)"/g)]
      .map(m => ({ caption: m[1].replace(/\\"/g, '"').slice(0, 400), date: m[2] ? m[2].slice(0, 10) : null, url: m[3] }));
    const er = num(p, 'engagementRate');
    const fake = num(p, 'fakeFollowers');
    const cred = num(p, 'audienceCredibility');
    return {
      username,
      full_name: str(p, 'fullName'),
      bio: bio ? bio.replace(/\s+/g, ' ').trim() : null,
      profile_url: str(p, 'url'),
      is_verified: /isVerified:!0/.test(p) ? true : /isVerified:!1/.test(p) ? false : null,
      followers: num(p, 'followers'),
      average_views: num(p, 'averageViews') || null, // 0 => not provided
      average_reel_plays: num(p, 'averageReelPlays'),
      average_likes: num(p, 'averageLikes'),
      average_comments: num(p, 'averageComments'),
      engagement_rate_pct: er === null ? null : +(er * 100).toFixed(2),
      fake_followers_pct: fake === null ? null : +(fake * 100).toFixed(2),
      audience_credibility_pct: cred === null ? null : +(cred * 100).toFixed(1),
      creator_location_label: str(p, 'location'), // provider's profile location (NOT audience)
      audience_countries: countries, audience_cities: cities, audience_gender: gender,
      followers_over_time: fot,
      data_as_of: fot.length ? fot[fot.length - 1].date : null, // last month of the provider's own crawl
      recent_post_dates: recent,
      popular_posts: popular, popular_reels: reels,
      hashtags: [...(p.match(/mostUsedHashtags:\[([^\]]*)\]/)?.[1] || '').matchAll(/"([^"]+)"/g)].map(m => m[1]),
      mentions: [...(p.match(/mostUsedMentions:\[([^\]]*)\]/)?.[1] || '').matchAll(/"([^"]+)"/g)].map(m => m[1]),
    };
  }).filter(Boolean);
}
