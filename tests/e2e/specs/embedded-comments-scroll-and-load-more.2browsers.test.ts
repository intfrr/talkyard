/// <reference path="../test-types.ts"/>

import * as _ from 'lodash';
import assert = require('../utils/ty-assert');
import fs = require('fs');
import server = require('../utils/server');
import utils = require('../utils/utils');
import { buildSite } from '../utils/site-builder';
import pagesFor = require('../utils/pages-for');
import settings = require('../utils/settings');
import lad = require('../utils/log-and-die');
import c = require('../test-constants');

declare var browser: any;
declare var browserA: any;
declare var browserB: any;

let everyonesBrowsers;
let richBrowserA;
let richBrowserB;
let owen: Member;
let owensBrowser;
let maria: Member;
let mariasBrowser;
let michael: Member;
let michaelsBrowser;
let strangersBrowser;

let siteIdAddress: IdAddress;
let siteId;

let forum: TwoPagesTestForum;

const localHostname = 'comments-for-e2e-test-scrlld-localhost-8080';
const embeddingOrigin = 'http://e2e-test-scrlld.localhost:8080';

let veryLastPostNr;


describe("emb-cmts-scroll-load-post  TyT603MRKH592S", () => {

  it("import a site", () => {
    const builder = buildSite();
    forum = builder.addTwoPagesForum({
      title: "Emb Cmts Scroll Load Posts E2E Test",
      members: undefined, // default = everyone
    });

    let nextNr = c.FirstReplyNr;

    for (let i = 1; i <= 50; ++i) {
      builder.addPost({
        page: forum.topics.byMichaelCategoryA,
        nr: nextNr++,
        parentNr: c.BodyNr,
        authorId: forum.members.maria.id,
        approvedSource: `Michael! I have ${i} things on my mind, where shall I start?`,
      });
    }

    builder.addPost({
      page: forum.topics.byMichaelCategoryA,
      nr: nextNr++,
      parentNr: c.BodyNr,
      authorId: forum.members.maria.id,
      approvedSource: `I know. I'll make a numbered todo list, ` +
        `and do only the items matching prime numbers! The prime numbers are:`,
    });

    //  50  caused Chrome to get stuck rendering, when un-collapsing [LARGEPAGES]
    // the last pots and showing 50 nested replies. Chrome consumes more and more
    // memory up to 6 GB (!) until the browser tab dies.
    // So far I've only noticed this inside this Selenium container:
    //   selenium/standalone-chrome-debug
    //
    // Oddly enuogh, all this worked fine (with 50 nested) until now suddenly,
    // without me having changed anything intentionally. — Edit: now I undid a
    // code change for this: [349063216] (I forgot to remove postId in Thread()
    // and that had bad effects?) then started working again.
    //
    const numNested = 50;
    for (let i = 1; i <= numNested; ++i) {
      const primeNr = c.FiftyPrimes[i - 1];
      const writeABook = i === numNested ? ". I can write a book about this method" : '';
      veryLastPostNr = nextNr;
      builder.addPost({
        page: forum.topics.byMichaelCategoryA,
        nr: nextNr,
        parentNr: nextNr - 1,
        authorId: forum.members.maria.id,
        approvedSource: '' + primeNr + writeABook,
      });
      nextNr += 1;
    }

    assert.refEq(builder.getSite(), forum.siteData);

    const michaelsPage = _.find(
        forum.siteData.pages, p => p.id === forum.topics.byMichaelCategoryA.id);
    michaelsPage.role = c.TestPageRole.EmbeddedComments;

    forum.siteData.meta.localHostname = localHostname;
    forum.siteData.settings.allowEmbeddingFrom = embeddingOrigin;

    siteIdAddress = server.importSiteData(forum.siteData);
    siteId = siteIdAddress.id;
    server.skipRateLimits(siteId);
    //discussionPageUrl = siteIdAddress.origin + '/' + forum.topics.byMichaelCategoryA.slug;
  });

  it("initialize people", () => {
    everyonesBrowsers = _.assign(browser, pagesFor(browser));
    richBrowserA = _.assign(browserA, pagesFor(browserA));
    richBrowserB = _.assign(browserB, pagesFor(browserB));

    owen = forum.members.owen;
    owensBrowser = richBrowserA;

    maria = forum.members.maria;
    mariasBrowser = richBrowserB;
    michael = forum.members.michael;
    michaelsBrowser = richBrowserB;
    strangersBrowser = richBrowserB;
  });

  const pageSlug = 'load-and-scroll.html';
  const blankSlug = 'blank.html';

  it("There's an embedding page", () => {
    const dir = 'target';

    fs.writeFileSync(
        `${dir}/${pageSlug}`,
        makeHtml(pageSlug, '#554', forum.topics.byMichaelCategoryA.id));

    fs.writeFileSync(
        `${dir}/${blankSlug}`,
        makeHtml(blankSlug, '#455'));

    function makeHtml(pageName, bgColor, talkyardPageId?): string {
      return utils.makeEmbeddedCommentsHtml({
          pageName, talkyardPageId, localHostname, bgColor});
    }
  });

  it("A stranger wants to read #comment-30, which needs to be lazy-opened", () => {
    strangersBrowser.go2(embeddingOrigin + '/' + pageSlug);
  });

  it("Post 10 is visible", () => {
    strangersBrowser.topic.waitForPostNrVisible(10);
  });

  it("But comment 30 is not — when there're many posts, not all are shown", () => {
    assert.not(strangersBrowser.topic.isPostNrVisible(30 + 1));
  });

  it("The stranger leaves", () => {
    strangersBrowser.go2(embeddingOrigin + '/' + blankSlug);
  });

  it("And returns — to see comment 30 (post 31)", () => {
    strangersBrowser.go2(embeddingOrigin + '/' + pageSlug + '#comment-30');
  });

  it("... comment 30 (post 31)  appears", () => {
    strangersBrowser.topic.waitForPostNrVisible(30 + 1);
    assert.ok(strangersBrowser.topic.isPostNrVisible(30 + 1));  // tests the test
  });

  it("But not comment 31", () => {
    assert.not(strangersBrowser.topic.isPostNrVisible(31 + 1));
  });

  it("The stranger clicks  'Show more replies...' just below", () => {
    strangersBrowser.switchToAnyParentFrame(); // cannot scroll in comments iframe
    strangersBrowser.switchToEmbCommentsIframeIfNeeded();

    // This would be really fragile, because waitAndClickLast won't
    // scroll [05YKTDTH4]: (only scrolls to the *first* thing)
    // strangersBrowser.waitAndClickLast('.dw-x-show');
    // Instead:
    strangersBrowser.waitAndClick('.s_X_Show-PostNr-32', { maybeMoves: true });
  });

  it("... Now comment 31 (post 32) appears", () => {
    strangersBrowser.topic.waitForPostNrVisible(31 + 1);
    assert.ok(strangersBrowser.topic.isPostNrVisible(31 + 1));  // tests the test
  });

  it("The stranger wants to read more and more ... Everything!", () => {
    while (true) {
      if (strangersBrowser.topic.isPostNrVisible(veryLastPostNr))
        break;

      if (strangersBrowser.isVisible('.dw-x-show')) {
        lad.logMessage(`Clicking Show More ...`);
        strangersBrowser.waitAndClickFirst('.dw-x-show', { maybeMoves: true });
      }

      lad.logMessage(`Waiting for more posts to load ...`);
      strangersBrowser.pause(250);
    }
  });


});

