import { foghousePrivacyEnabled } from '../../foghouse-privacy'
import '../../components/StaticPage.css'

export function FoghousePrivacy() {
  if (!foghousePrivacyEnabled()) {
    return (
      <div class="static-page">
        <h1>Instance privacy policy</h1>
        <p>This server has not enabled the Foghouse instance policy.</p>
        <p>
          <a href="/privacy">Read this server's privacy information</a>.
        </p>
      </div>
    )
  }

  return (
    <article class="static-page">
      <h1>Foghouse Privacy</h1>
      <p>
        <em>Last updated: November 13, 2026</em>
      </p>
      <p>
        This policy applies to the Foghouse-operated Aurboda instance. It does not describe or bind other
        people who host Aurboda. It explains the access model and the storage behavior in this version; the
        operational details identified below still need confirmation by the Foghouse operator.
      </p>

      <section>
        <h2>Who can access private data</h2>
        <p>
          Your private account data is available to you and is not accessible to other ordinary users. You may
          voluntarily authorize your own AI client or another integration through Aurboda's connection
          mechanism to access your data. The permissions you grant determine what it may do.
        </p>
        <p>
          The Foghouse administrator can access stored data. The administrator will use that access only to
          confirm or investigate bugs, or to perform actions you authorize. Storage is not end-to-end
          encrypted against the administrator. Administrator access remains available for legitimate support.
        </p>
        <p>
          Information you deliberately publish, federate, or share through a link has a different audience.
          Shared Resources are available to signed-in users. Feed pictures are accessible to anyone with their
          picture link, even when the surrounding post has a more restricted audience. Do not put private
          material in those shared locations.
        </p>
      </section>

      <section>
        <h2>What the service stores</h2>
        <p>
          Aurboda stores the records you save and the data from sources you connect. Depending on the features
          you use, this includes health metrics, sleep and activity, location, screen time, listening history,
          calendar data, food records, questionnaires and answers, treatments, Work records, People profiles
          and observations, tasks, notes, Journal entries and workbook attempts, settings and sharing records.
        </p>
        <p>
          Private application records are stored in a separate PostgreSQL database for each account. Feed
          images and uploaded icons are stored in that database; People profiles can include embedded photos.
          Shared Resources metadata is stored centrally and uploaded resource files are stored on the server's
          configured filesystem. Central records also include account and administrative configuration,
          integration authorization and usage information. Connected services may require stored credentials
          or tokens; exports can contain these secrets.
        </p>
        <p>
          Journal stores entry text and dates, areas, tags, favorites, pins, record links and personal
          templates. Workbook attempts retain answers, progress, status and an immutable snapshot of the
          versioned prompts used for that attempt. Earlier entry versions and trashed entries remain stored
          until permanently removed. Original Journal audio and image files are stored as binary data in your
          private database, alongside their filenames and metadata. These original files may retain embedded
          metadata; they are not made public through the feed-picture link mechanism.
        </p>
      </section>

      <section>
        <h2>Optional AI and external services</h2>
        <p>
          Connecting an AI client is optional. Aurboda exposes the existing MCP connection so a client you
          authorize can retrieve permitted account data, including Journal text, workbook answers with their
          saved prompt context, revisions and attachment information. Supported clients can retrieve original
          media through authenticated access, subject to transfer limits. Journal content is data, not
          instructions granting additional tool permissions. Information an external AI provider retrieves is
          then subject to that provider's handling and policies. Disabling or revoking access stops future
          authorized retrieval; it cannot recall information already retrieved or copies the provider made.
          Legacy browser bearer tokens and older connections can have full access and are not made read-only
          by this policy. OAuth revocation does not individually revoke a legacy browser token. Read access on
          a new read-only connection does not itself grant editing or deletion permission; check the
          connection's actual permission level before authorizing it.
        </p>
        <p>
          Other enabled features communicate with external services: configured source APIs synchronize data,
          federation sends shared content to other servers, and browser notifications use the browser's push
          service. These flows depend on your choices and the instance configuration. Optional Sentry error
          reporting, when configured by the operator, sends error telemetry with request or personally
          identifying information enabled. Whether it is currently enabled has not been verified. Availability
          of an audio file would not mean every AI client can interpret audio; this integration does not
          provide transcription.
        </p>
      </section>

      <section>
        <h2>Export and restore</h2>
        <p>
          Settings → Export account data downloads a gzipped SQL copy of your private account database,
          including saved database attachments and integration credentials. Journal tables, workbook
          snapshots, progress, revisions, trash and original attachment bytes are stored in that database and
          included by the full-database export; expiring media links do not replace the file bytes. Keep it
          secure. The export does not include shared Resources files, the whole central database, browser-only
          drafts, or application source code. A download link carries its own short-lived access token; anyone
          with the link can use it while it remains valid.
        </p>
        <p>
          There is no in-app upload restore. An operator can manually restore SQL into a compatible customized
          Aurboda installation. Account setup and integration reconnection may be needed; restoring under
          another username does not automatically repair every stored link. Journal export coverage has been
          checked against the storage and export code, but Journal round-trip restore tests have not run in
          this environment because the required container runtime is unavailable. This is not a claim of a
          tested Journal restore. Unsaved browser-only text or recordings are not server backups.
        </p>
      </section>

      <section>
        <h2>Deletion, logs and backups</h2>
        <p>
          Deleting your account through Settings drops the private database and database role after the
          confirmation checks. The service also attempts integration disconnection, central-record cleanup and
          a deletion notice to federated followers. Those secondary operations can fail and be logged.
          Deletion cannot recall exports, previously shared or federated copies, or data an external
          integration already retrieved. Deleting an individual record follows that feature's behavior; it
          does not establish immediate deletion from every log or backup.
        </p>
        <p>
          Moving a Journal entry to trash retains its contents, revisions and attachments for recovery.
          Permanently deleting that entry removes its stored revisions and attachments from the active
          database. Deleting an attachment separately removes its original bytes; an entry revision is not an
          attachment recovery copy. Independent backups and previously downloaded copies may remain.
        </p>
        <p>
          The application records operational and audit information. Automatic write-request audit summaries
          retain structural metadata rather than request bodies, but other direct audit calls, error logs and
          infrastructure logs may contain personal information. Direct database access is not recorded by the
          application's request audit log. No complete log-retention or backup expiration period has been
          verified for this instance; this policy does not promise immediate removal from backups.
        </p>
      </section>

      <section>
        <h2>Infrastructure and details awaiting confirmation</h2>
        <p>
          The source configuration supports an application server, PostgreSQL and a server file volume. The
          actual Foghouse hosting, reverse proxy or tunnel, monitoring, backup locations and their service
          providers have not been independently verified for this policy. Depending on that configuration,
          infrastructure providers may process traffic, stored data or logs. Historical deployment
          documentation records local rootless containers behind a public tunnel, but it does not verify the
          current configuration or the tunnel provider's access. We do not promise that only the administrator
          has technical access across the infrastructure.
        </p>
        <p>
          The operator still needs to confirm the infrastructure providers and their data flows, log and
          backup retention, backup deletion procedures, and a privacy contact method. No contact address,
          retention deadline, compliance certification or operational guarantee is supplied here without
          verification. Ask the Foghouse operator for these details before relying on the service for
          sensitive information.
        </p>
      </section>
    </article>
  )
}
