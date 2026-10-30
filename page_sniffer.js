/**
 * page_sniffer.js - Runs in MAIN world at document_start on x.com / twitter.com
 * Passively captures User profiles (Bio, Join Date, Followers, Following, Verified)
 * and User timelines (Tweets, Retweets, Quote Tweets, Hashtags) directly from
 * X's own GraphQL responses (HomeTimeline, TweetDetail, UserByScreenName, UserTweets).
 */

(() => {
  'use strict';

  if (window.__XRAY_SNIFFER_INSTALLED__) return;
  window.__XRAY_SNIFFER_INSTALLED__ = true;

  const sniffedBuffer = [];
  const MAX_BUFFER_ITEMS = 60;

  function pushToContentScript(payload) {
    if (!payload || (!payload.users?.length && !payload.tweets?.length)) return;
    sniffedBuffer.push(payload);
    if (sniffedBuffer.length > MAX_BUFFER_ITEMS) {
      sniffedBuffer.shift();
    }
    try {
      window.postMessage({
        source: 'XRAY_GRAPHQL_SNIFFER',
        type: 'DATA',
        payload
      }, '*');
    } catch (e) {
      // Ignore postMessage errors
    }
  }

  // Allow content.js (which loads at document_idle) to replay buffered GraphQL payloads
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.source === 'XRAY_CONTENT_SCRIPT' && event.data.type === 'REQUEST_BUFFER') {
      for (const item of sniffedBuffer) {
        try {
          window.postMessage({
            source: 'XRAY_GRAPHQL_SNIFFER',
            type: 'DATA',
            payload: item
          }, '*');
        } catch (e) {}
      }
    }
  });

  function unwrapUserResult(rawUser) {
    if (!rawUser || typeof rawUser !== 'object') return null;
    if (rawUser.__typename === 'UserResults' && rawUser.result) {
      return rawUser.result;
    }
    return rawUser;
  }

  function unwrapTweetResult(rawTweet) {
    if (!rawTweet || typeof rawTweet !== 'object') return null;
    if (rawTweet.__typename === 'TweetWithVisibilityResults' && rawTweet.tweet) {
      return rawTweet.tweet;
    }
    if (rawTweet.result) {
      return unwrapTweetResult(rawTweet.result);
    }
    return rawTweet;
  }

  function extractUserFields(userObj) {
    const u = unwrapUserResult(userObj);
    if (!u || typeof u !== 'object') return null;
    const screenName = (u.core?.screen_name || u.legacy?.screen_name || '').trim();
    if (!screenName) return null;

    const restId = String(u.rest_id || u.id_str || '').trim();
    const displayName = (u.core?.name || u.legacy?.name || '').trim();
    const bio = (u.legacy?.description || u.profile_bio?.description || '').trim();
    const joinDate = (u.core?.created_at || u.legacy?.created_at || '').trim();
    const followersCount = typeof u.legacy?.followers_count === 'number' ? u.legacy.followers_count : null;
    const followingCount = typeof u.legacy?.friends_count === 'number' ? u.legacy.friends_count : null;
    const verifiedType = (u.verified_type || u.legacy?.verified_type || '').trim();
    const isGreyBadge =
      verifiedType.toLowerCase() === 'government' ||
      u.affiliates_highlighted_label?.label?.userLabelType === 'GovernmentLabel' ||
      /government/i.test(u.affiliates_highlighted_label?.label?.description || '');
    const governmentLabel = (u.affiliates_highlighted_label?.label?.description || '').trim();
    const isVerified = Boolean(u.is_blue_verified || u.legacy?.verified || verifiedType);
    const userUrl = (
      u.legacy?.entities?.url?.urls?.[0]?.expanded_url ||
      u.legacy?.entities?.url?.urls?.[0]?.display_url ||
      u.legacy?.url ||
      ''
    ).trim();

    return {
      handle: screenName.toLowerCase(),
      restId,
      displayName,
      bio,
      joinDate,
      followersCount,
      followingCount,
      isVerified,
      isGreyBadge: Boolean(isGreyBadge),
      verifiedType: isGreyBadge ? 'Government' : verifiedType,
      governmentLabel: governmentLabel || (isGreyBadge ? 'حساب رسمی دولتی / حاکمیتی' : ''),
      userUrl
    };
  }

  function cleanTweetText(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    return rawText
      .replace(/https:\/\/t\.co\/[a-zA-Z0-9]+$/g, '')
      .trim();
  }

  function extractEntitiesFromGraphQL(rootData) {
    const usersMap = new Map();
    const tweetsList = [];
    const visited = new WeakSet();

    function recordUser(uInfo) {
      if (!uInfo || !uInfo.handle) return;
      const prev = usersMap.get(uInfo.handle) || {};
      usersMap.set(uInfo.handle, {
        handle: uInfo.handle,
        restId: uInfo.restId || prev.restId || '',
        displayName: uInfo.displayName || prev.displayName || '',
        bio: uInfo.bio || prev.bio || '',
        joinDate: uInfo.joinDate || prev.joinDate || '',
        followersCount: uInfo.followersCount ?? prev.followersCount ?? null,
        followingCount: uInfo.followingCount ?? prev.followingCount ?? null,
        isVerified: Boolean(uInfo.isVerified || prev.isVerified),
        isGreyBadge: Boolean(uInfo.isGreyBadge || prev.isGreyBadge),
        verifiedType: uInfo.verifiedType || prev.verifiedType || '',
        governmentLabel: uInfo.governmentLabel || prev.governmentLabel || '',
        userUrl: uInfo.userUrl || prev.userUrl || ''
      });
    }

    function walk(node, depth = 0) {
      if (!node || typeof node !== 'object' || depth > 28) return;
      if (visited.has(node)) return;
      visited.add(node);

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          walk(node[i], depth + 1);
        }
        return;
      }

      // 1. Check if node is a User object
      if (
        node.__typename === 'User' ||
        (node.legacy && (node.legacy.screen_name || node.core?.screen_name) && typeof node.legacy.followers_count === 'number')
      ) {
        const uInfo = extractUserFields(node);
        if (uInfo) recordUser(uInfo);
      }

      // 2. Check if node is a Tweet object
      const tNode = (node.__typename === 'TweetWithVisibilityResults' && node.tweet) ? node.tweet : node;
      const rawAuthor = tNode?.core?.user_results?.result || tNode?.user_results?.result;
      const isTweet =
        tNode &&
        rawAuthor &&
        (tNode.__typename === 'Tweet' || (tNode.legacy && typeof tNode.legacy.full_text === 'string'));

      if (isTweet) {
        const authorInfo = extractUserFields(rawAuthor);
        if (authorInfo) {
          recordUser(authorInfo);
          const authorHandle = authorInfo.handle;

          // Check if this tweet is a Retweet
          const rtRaw = tNode.legacy?.retweeted_status_result?.result || tNode.retweeted_status_result?.result;
          const rtNode = unwrapTweetResult(rtRaw);

          if (rtNode) {
            const rtAuthorInfo = extractUserFields(rtNode.core?.user_results?.result || rtNode.user_results?.result);
            if (rtAuthorInfo) recordUser(rtAuthorInfo);
            const rtAuthorHandle = rtAuthorInfo?.handle || '';
            const rtFullText = cleanTweetText(
              rtNode.note_tweet?.note_tweet_results?.result?.text ||
              rtNode.legacy?.full_text ||
              ''
            );
            const rtHashtags = (rtNode.legacy?.entities?.hashtags || [])
              .map(h => h?.text)
              .filter(Boolean);

            if (rtFullText && rtAuthorHandle && rtAuthorHandle !== authorHandle) {
              tweetsList.push({
                authorHandle,
                isRetweet: true,
                retweetedAuthor: rtAuthorHandle,
                text: rtFullText,
                hashtags: rtHashtags,
                quotedAuthorHandle: '',
                quoteText: '',
                referencedHandles: [rtAuthorHandle],
                links: []
              });
            }
          } else {
            // Author's own tweet (or Quote Tweet / Reply)
            let fullText = cleanTweetText(
              tNode.note_tweet?.note_tweet_results?.result?.text ||
              tNode.legacy?.full_text ||
              ''
            );
            // Strip leading RT @handle: if any
            if (!fullText.startsWith('RT @')) {
              const hashtags = (tNode.legacy?.entities?.hashtags || [])
                .map(h => h?.text)
                .filter(Boolean);

              const mentions = (tNode.legacy?.entities?.user_mentions || [])
                .map(m => (m?.screen_name || '').toLowerCase())
                .filter(h => h && h !== authorHandle);

              const links = (tNode.legacy?.entities?.urls || [])
                .map(u => u?.expanded_url || u?.display_url || '')
                .filter(Boolean);

              let quotedAuthorHandle = '';
              let quoteText = '';
              const qRaw = tNode.quoted_status_result?.result || tNode.legacy?.quoted_status_result?.result;
              const qNode = unwrapTweetResult(qRaw);
              if (qNode) {
                const qAuthorInfo = extractUserFields(qNode.core?.user_results?.result || qNode.user_results?.result);
                if (qAuthorInfo) {
                  recordUser(qAuthorInfo);
                  quotedAuthorHandle = qAuthorInfo.handle;
                }
                quoteText = cleanTweetText(
                  qNode.note_tweet?.note_tweet_results?.result?.text ||
                  qNode.legacy?.full_text ||
                  ''
                );
              }

              if (fullText || hashtags.length > 0) {
                tweetsList.push({
                  authorHandle,
                  isRetweet: false,
                  retweetedAuthor: '',
                  text: fullText,
                  hashtags,
                  quotedAuthorHandle,
                  quoteText,
                  referencedHandles: mentions,
                  links
                });
              }
            }
          }
        }
      }

      // Recurse into child properties
      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === 'quoted_status_result' || k === 'retweeted_status_result') continue;
        const val = node[k];
        if (val && typeof val === 'object') {
          walk(val, depth + 1);
        }
      }
    }

    try {
      walk(rootData, 0);
    } catch (e) {}

    return {
      users: Array.from(usersMap.values()),
      tweets: tweetsList
    };
  }

  function handleRawJsonText(url, text) {
    if (!text || text.length < 20) return;
    try {
      const json = JSON.parse(text);
      const extracted = extractEntitiesFromGraphQL(json);
      if (extracted.users.length > 0 || extracted.tweets.length > 0) {
        pushToContentScript(extracted);
      }
    } catch (e) {
      // Ignore non-JSON responses
    }
  }

  // 1. Hook XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    try {
      this.__xrayUrl = typeof url === 'string' ? url : String(url || '');
    } catch (e) {}
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    try {
      const url = this.__xrayUrl || '';
      if (url.includes('/i/api/graphql/') || url.includes('/graphql/') || url.includes('/i/api/2/')) {
        this.addEventListener('load', function() {
          try {
            if (this.status >= 200 && this.status < 300 && (this.responseType === '' || this.responseType === 'text') && this.responseText) {
              handleRawJsonText(url, this.responseText);
            } else if (this.status >= 200 && this.status < 300 && this.responseType === 'json' && this.response) {
              const extracted = extractEntitiesFromGraphQL(this.response);
              if (extracted.users.length > 0 || extracted.tweets.length > 0) {
                pushToContentScript(extracted);
              }
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
    return origSend.apply(this, args);
  };

  // 2. Hook window.fetch
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = async function(...args) {
      const response = await origFetch.apply(this, args);
      try {
        const req = args[0];
        const url = typeof req === 'string' ? req : (req?.url || '');
        if (url && (url.includes('/i/api/graphql/') || url.includes('/graphql/') || url.includes('/i/api/2/'))) {
          const clone = response.clone();
          clone.text().then(t => handleRawJsonText(url, t)).catch(() => {});
        }
      } catch (e) {}
      return response;
    };
  }
})();
