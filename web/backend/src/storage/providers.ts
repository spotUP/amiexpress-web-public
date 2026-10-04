/**
 * The object-storage providers a sysop can pick from, and what each one needs.
 *
 * One adapter serves all of them - `S3Backend` with a configurable endpoint -
 * so the only thing that differs is the endpoint's SHAPE and the terms of the
 * account. Those terms are a bill, not a detail: R2 charges nothing for
 * egress while S3 charges $0.09/GB, and Wasabi bills a deleted file for its
 * full 90 days. The admin picks a provider rather than typing all of it.
 *
 * Figures come from the design spec's free-tier and paid tables
 * (docs/superpowers/specs/2026-09-03-pooled-object-storage-design.md).
 *
 * Each provider also carries its `setup` guide - the sign-up link and the
 * console steps the admin's Add Drive wizard walks a sysop through. They are
 * written in the console's own wording, checked against the provider's own
 * documentation on 2026-10-04; the pages each was checked against are cited
 * above its entry. Where the docs did not state a label, the step says what
 * to look for rather than quoting a button that may not exist.
 */
export interface StorageProvider {
  /** Stable id, written to DRIVE.n.PROVIDER so the page can show the choice back. */
  id: string;
  label: string;
  /**
   * Endpoint with `{}` where the sysop's own value goes, or null when the
   * provider has no fixed shape (MinIO is self-hosted, local needs none).
   */
  endpointTemplate: string | null;
  /** What the `{}` is, in the sysop's words. Empty when there is nothing to fill. */
  endpointFieldLabel: string;
  /**
   * A second value the endpoint needs, its `{region}` - Oracle's tenancy home
   * region. Empty when the template has no `{region}`.
   */
  regionFieldLabel: string;
  /**
   * Whether the `{}` value IS the region requests are signed for
   * (s3.<region>.backblazeb2.com). A bucket in us-west-004 signed for the
   * default eu-central-003 is refused, so the two must not be set apart.
   */
  regionFromEndpointField: boolean;
  defaultRegion: string;
  /** FREE tiers are the point of the pool; PAID is a deliberate choice. */
  volumeClass: 'FREE' | 'PAID';
  /** Free storage in bytes, as a starting QUOTA. 0 when there is no free tier. */
  freeQuotaBytes: number;
  /** FREE means downloads cost nothing; METERED means every GB served is billed. */
  egress: 'FREE' | 'METERED';
  /** Days a deleted object still bills for. 0 for none. */
  minimumRetentionDays: number;
  /** The one line that decides it for a BBS. */
  note: string;
  setup: ProviderSetupGuide;
}

/** From "no account" to "a key for one bucket", in the provider console's own words. */
export interface ProviderSetupGuide {
  /** Where an account is opened. https, always. */
  signupUrl: string;
  /** The provider's own guide, for anything the steps leave out. */
  docsUrl: string;
  account: string[];
  bucket: string[];
  key: string[];
  /** The console's name for the value the admin calls "Key ID". */
  keyIdField: string;
  /** The console's name for the value the admin calls "Secret". */
  secretField: string;
  /** Whether the console shows the secret once only, at creation. */
  secretShownOnce: boolean;
  /** Where the console shows the value the endpoint field asks for. Empty when there is no field. */
  endpointHint: string;
}

const GB = 1024 * 1024 * 1024;

/**
 * Read and write to ONE bucket, in the IAM policy language Amazon S3, Wasabi
 * and MinIO/AIStor share. Listed actions rather than `s3:*Object`, which was
 * not confirmed on Wasabi or MinIO. BUCKET is the sysop's bucket name.
 */
const ONE_BUCKET_POLICY_STEP =
  'Policy (replace BUCKET with the bucket name): {"Version":"2012-10-17","Statement":[' +
  '{"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::BUCKET"]},' +
  '{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload",' +
  '"s3:ListMultipartUploadParts"],"Resource":["arn:aws:s3:::BUCKET/*"]}]}';

export const STORAGE_PROVIDERS: StorageProvider[] = [
  /*
   * https://developers.cloudflare.com/r2/get-started/
   * https://developers.cloudflare.com/r2/get-started/s3/
   * https://developers.cloudflare.com/r2/api/tokens/
   * https://developers.cloudflare.com/r2/buckets/create-buckets/
   * https://developers.cloudflare.com/r2/reference/data-location/
   * A jurisdiction bucket needs <account>.eu.r2.cloudflarestorage.com, which
   * this template cannot build - hence "do not choose a jurisdiction".
   */
  {
    id: 'r2',
    label: 'Cloudflare R2',
    endpointTemplate: 'https://{}.r2.cloudflarestorage.com',
    endpointFieldLabel: 'Account ID',
    regionFieldLabel: '',
    regionFromEndpointField: false,
    defaultRegion: 'auto',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * GB,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Zero egress cost - the best fit for a board that exists to serve downloads.',
    setup: {
      signupUrl: 'https://dash.cloudflare.com/sign-up',
      docsUrl: 'https://developers.cloudflare.com/r2/get-started/s3/',
      account: [
        'Create a Cloudflare account on the sign-up page and verify your email.',
        'In the dashboard, go to Storage & databases > R2 > Overview.',
        'Complete the checkout flow to add the R2 subscription - Cloudflare will not issue an R2 key before this. The free tier includes 10 GB of storage a month and downloads are free.',
      ],
      bucket: [
        'On R2 Overview, select Create bucket.',
        'Enter a bucket name: lowercase letters, numbers and hyphens, 3 to 63 characters.',
        'For location, a hint of Western Europe (weur) suits a European board. Do not choose a jurisdiction - a jurisdiction bucket needs a different address this board does not build.',
        'Select Create bucket. R2 buckets are private unless you turn public access on - leave it off.',
      ],
      key: [
        'On R2 Overview, under Account Details, select Manage next to API Tokens.',
        'Select Create Account API token.',
        'Under Permissions choose Object Read & Write, then Apply to specific buckets only, and pick this bucket.',
        'Select Create API Token, and copy the Access Key ID and Secret Access Key.',
      ],
      keyIdField: 'Access Key ID',
      secretField: 'Secret Access Key',
      secretShownOnce: true,
      endpointHint:
        'The Account ID is under Account Details on the R2 Overview page. It is also the first part of the S3 API address shown when the token is created: https://ACCOUNT_ID.r2.cloudflarestorage.com.',
    },
  },
  /*
   * https://www.scaleway.com/en/docs/account/how-to/create-an-account/
   * https://www.scaleway.com/en/docs/object-storage/how-to/create-a-bucket/
   * https://www.scaleway.com/en/docs/iam/credentials/create-api-keys/
   * https://www.scaleway.com/en/docs/iam/how-to/create-application/
   * https://www.scaleway.com/en/docs/iam/how-to/create-policy/
   * https://www.scaleway.com/en/docs/object-storage/how-to/create-bucket-policy/
   * https://www.scaleway.com/en/docs/object-storage/concepts/
   */
  {
    id: 'scaleway',
    label: 'Scaleway',
    endpointTemplate: 'https://s3.{}.scw.cloud',
    endpointFieldLabel: 'Region (fr-par, nl-ams, pl-waw, it-mil)',
    regionFieldLabel: '',
    regionFromEndpointField: true,
    defaultRegion: 'fr-par',
    volumeClass: 'FREE',
    freeQuotaBytes: 75 * GB,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Largest free tier at 75 GB (EU). A card is required to open the account.',
    setup: {
      signupUrl: 'https://account.scaleway.com/register',
      docsUrl: 'https://www.scaleway.com/en/docs/object-storage/how-to/create-a-bucket/',
      account: [
        'Click Sign Up and pick a sign-up method.',
        'Choose Personal project as the organization type, pick your country, name the Organization and click Next.',
        'Add a payment method. A valid credit card is required (prepaid cards are not accepted); Scaleway places and refunds a 1 EUR authorization.',
      ],
      bucket: [
        'Click Object Storage in the left side menu, then + Create bucket.',
        'Select the region: fr-par (Paris), nl-ams (Amsterdam), pl-waw (Warsaw) or it-mil (Milan).',
        'Enter a name and choose Private for the bucket visibility.',
        'Click Create bucket.',
      ],
      key: [
        'Open IAM & API keys from the top-right menu, go to Applications and click Create application.',
        'In the Policies tab click Create policy: principal is that application, permission sets ObjectStorageObjectsRead, ObjectStorageObjectsWrite and ObjectStorageObjectsDelete, scope the bucket\'s Project. Click Create policy.',
        'In the API keys tab click + Generate API key, with the application as bearer. For Object Storage choose Yes, set up preferred Project, pick the bucket\'s Project, and click Generate API key.',
        'To limit the key to this one bucket: Object Storage > Bucket policies > + Create bucket policy, allow the application on this bucket, keep Maintain access to bucket ticked.',
        'Copy the access key and secret key from the screen that follows. Permissions can take five minutes to apply.',
      ],
      keyIdField: 'access key',
      secretField: 'secret key',
      secretShownOnce: true,
      endpointHint:
        'Enter the region you picked for the bucket, such as fr-par. The bucket\'s Bucket settings tab shows it too.',
    },
  },
  /*
   * https://storj.dev/dcs/getting-started
   * https://storj.dev/dcs/access
   * https://storj.dev/dcs/api/s3/s3-compatible-gateway
   * https://storj.dev/support/object-browser
   */
  {
    id: 'storj',
    label: 'Storj',
    endpointTemplate: 'https://gateway.storjshare.io',
    endpointFieldLabel: '',
    regionFieldLabel: '',
    regionFromEndpointField: false,
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 25 * GB,
    egress: 'METERED',
    minimumRetentionDays: 0,
    note: '25 GB free with 25 GB/month of egress, through the S3 gateway.',
    setup: {
      signupUrl: 'https://www.storj.io/signup',
      docsUrl: 'https://storj.dev/dcs/getting-started',
      account: [
        'Sign up on the sign-up page; Storj picks the nearest satellite for you and starts a free trial.',
        'Adding a payment method later raises the project limits to Pro Account limits.',
      ],
      bucket: [
        'In the console, open the bucket browser and click New bucket.',
        'Enter a name: lowercase letters, numbers and hyphens.',
        'The first time, Storj asks for an encryption passphrase. Generate or enter one, tick that you have saved it, and click Continue - keep it, it is the only way to read the files in the console.',
      ],
      key: [
        'Go to Access Keys in the left side menu and click New Access Key.',
        'Enter a name, set the type to S3 Credentials, and choose Advanced rather than full access.',
        'Keep Use the current passphrase. Permissions: Read, Write, List and Delete.',
        'Under buckets choose Select Buckets and pick this bucket, then click Create Access.',
        'Copy the access key and secret key, or click Download all.',
      ],
      keyIdField: 'access key',
      secretField: 'secret key',
      // Storj's docs say to save them; they do not say the console can show them again.
      secretShownOnce: true,
      endpointHint: '',
    },
  },
  /*
   * https://www.backblaze.com/docs/cloud-storage-create-and-manage-buckets
   * https://www.backblaze.com/docs/cloud-storage-create-and-manage-app-keys
   * https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys
   * https://www.backblaze.com/apidocs/introduction-to-the-s3-compatible-api
   * https://www.backblaze.com/docs/cloud-storage-data-regions
   * The master application key does not work with the S3 API, and a key
   * limited to one bucket needs "Allow List All Bucket Names" for S3 clients.
   */
  {
    id: 'b2',
    label: 'Backblaze B2',
    endpointTemplate: 'https://s3.{}.backblazeb2.com',
    endpointFieldLabel: 'Region (eu-central-003, us-west-004)',
    regionFieldLabel: '',
    regionFromEndpointField: true,
    defaultRegion: 'eu-central-003',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * GB,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Free egress up to three times what you store. Frankfurt region available.',
    setup: {
      signupUrl: 'https://www.backblaze.com/sign-up/cloud-storage',
      docsUrl: 'https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys',
      account: [
        'Fill in the sign-up form. No credit card is needed for the free 10 GB.',
        'Before you click Get Started Free, open the Region selector under the button and choose EU Central for a European board - it defaults to US West.',
        'Choose carefully: an account\'s region cannot be changed later, and every bucket lives in it.',
      ],
      bucket: [
        'Go to B2 Cloud Storage > Buckets in the left menu and click Create a Bucket.',
        'Enter a bucket name (unique across all of Backblaze).',
        'Set Files in Bucket to Private. Leave Object Lock off.',
        'Click Create a Bucket.',
      ],
      key: [
        'Go to B2 Cloud Storage > Application Keys and click Add a New Application Key. (The master application key does not work here - make a new one.)',
        'Enter a name, and set Allow Access to Bucket(s) to this bucket only.',
        'Set Type of Access to Read and Write, and tick Allow List All Bucket Names - S3 clients need it.',
        'Click Create New Key, then copy the keyID and the applicationKey straight away.',
      ],
      keyIdField: 'keyID',
      secretField: 'applicationKey',
      secretShownOnce: true,
      endpointHint:
        'The bucket shows an Endpoint such as s3.eu-central-003.backblazeb2.com. The region is the middle part - eu-central-003 - and that is what goes in the Region field.',
    },
  },
  /*
   * https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm
   * https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingcredentials.htm
   * https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/understandingnamespaces.htm
   * https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/managingbuckets_topic-To_create_a_bucket.htm
   * https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm
   * The S3 endpoint is <namespace>.compat.objectstorage.<region>.oraclecloud.com
   * in the tenancy's HOME region - it was hardcoded to Frankfurt before.
   */
  {
    id: 'oracle',
    label: 'Oracle Always Free',
    endpointTemplate: 'https://{}.compat.objectstorage.{region}.oraclecloud.com',
    endpointFieldLabel: 'Namespace',
    regionFieldLabel: 'Home region (eu-frankfurt-1)',
    regionFromEndpointField: false,
    defaultRegion: 'eu-frankfurt-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * GB,
    egress: 'METERED',
    minimumRetentionDays: 0,
    note: 'Never expires. 10 GB/month egress and 50,000 requests.',
    setup: {
      signupUrl: 'https://signup.oraclecloud.com',
      docsUrl: 'https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm',
      account: [
        'On the sign-up page, pick your country, enter your name and email, and verify the email.',
        'Choose your Home Region carefully - it cannot be changed after signing up, and Always Free storage lives only there.',
        'Add a credit card for verification. It is not charged unless you upgrade.',
        'Accept the terms and select Start my free trial.',
      ],
      bucket: [
        'Make sure the console is set to your home region.',
        'Open the navigation menu, select Storage, and under Object Storage & Archive Storage select Buckets.',
        'Select Create bucket, enter a Bucket name, leave Default storage tier on Standard, and select Create bucket. New buckets are private.',
      ],
      key: [
        'A key has every permission of its user. For least privilege, create a user in its own group with a policy such as: Allow group G to read buckets in compartment C, and Allow group G to manage objects in compartment C where target.bucket.name=\'BUCKET\'.',
        'As that user, open the Profile menu > User settings, then Customer Secret Keys on the left, and select Generate Secret Key.',
        'Enter a description and select Generate Secret Key. Copy the Secret Key now, then select Close.',
        'Copy the Access Key shown next to the key\'s name.',
      ],
      keyIdField: 'Access Key',
      secretField: 'Secret Key',
      secretShownOnce: true,
      endpointHint:
        'The Namespace is on the tenancy details page: Profile menu > Tenancy: your tenancy name. The home region is the region identifier you chose at sign-up, such as eu-frankfurt-1.',
    },
  },
  /*
   * https://www.idrive.com/s3-storage-e2/faq-access-keys
   * https://www.idrive.com/s3-storage-e2/faq-dashboard
   * https://www.idrive.com/s3-storage-e2/e2-endpoint-urls
   * https://www.idrive.com/s3-storage-e2/region-endpoints
   * Endpoints come in two shapes (s3.<region>.idrivee2.com and per-user
   * hosts on idrivee2-NN.com), so the sysop pastes the whole host.
   */
  {
    id: 'idrive',
    label: 'IDrive e2',
    endpointTemplate: 'https://{}',
    endpointFieldLabel: 'Endpoint (from Enabled regions on the dashboard)',
    regionFieldLabel: '',
    regionFromEndpointField: false,
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 10 * GB,
    egress: 'METERED',
    minimumRetentionDays: 0,
    note: 'Consumer-leaning, 10 GB free.',
    setup: {
      signupUrl: 'https://console.idrivee2.com/signup',
      docsUrl: 'https://www.idrive.com/s3-storage-e2/faq-access-keys',
      account: [
        'Sign up on the sign-up page (10 GB free).',
        'On the Dashboard, pick a location from the Region list and click Enable.',
      ],
      bucket: [
        'Click Create Bucket on the dashboard.',
        'Check the region in the drop-down, enter a bucket name, and leave access on Private.',
        'Click Create Bucket.',
      ],
      key: [
        'Open the Access Keys tab and click Create Access Key.',
        'Enter a name and select the same region as the bucket.',
        'Choose Read and write permission.',
        'Pick this bucket only - by default all buckets are selected.',
        'Click Create Access Key, then copy or download the Access Key ID and Secret Access Key.',
      ],
      keyIdField: 'Access Key ID',
      secretField: 'Secret Access Key',
      // IDrive's docs say to download/copy the details; they do not say it can be shown again.
      secretShownOnce: true,
      endpointHint:
        'The Enabled regions section of the Dashboard lists each region with its endpoint URL. Paste that host, without https://.',
    },
  },
  /*
   * https://filebase.com/docs/get-started/sign-up
   * https://filebase.com/docs/get-started/create-a-bucket
   * https://filebase.com/docs/get-started/access-keys
   * https://filebase.com/docs/s3-api/overview
   * The docs name s3.filebase.io; s3.filebase.com still answers but is no
   * longer documented.
   */
  {
    id: 'filebase',
    label: 'Filebase',
    endpointTemplate: 'https://s3.filebase.io',
    endpointFieldLabel: '',
    regionFieldLabel: '',
    regionFromEndpointField: false,
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 5 * GB,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'IPFS/Sia backed, 5 GB free.',
    setup: {
      signupUrl: 'https://console.filebase.com/signup',
      docsUrl: 'https://filebase.com/docs/get-started/access-keys',
      account: [
        'Enter your email and a password on the sign-up page. No credit card is needed.',
        'Click the confirmation link in the email. The free plan is 5 GB, one bucket and one key pair.',
      ],
      bucket: [
        'Sign in and click Buckets in the left navigation, then Create Bucket.',
        'Enter a name, unique across all of Filebase: 3 to 63 lowercase letters, numbers and dashes.',
        'Leave the bucket private and click Create Bucket.',
      ],
      key: [
        'Click Access Keys in the left navigation.',
        'Filebase has one key pair per account, with full access to every bucket on it - it cannot be limited to one bucket. Use an account of its own for the board if that matters.',
        'Copy the Access Key and the Secret Key.',
      ],
      keyIdField: 'Access Key',
      secretField: 'Secret Key',
      secretShownOnce: false,
      endpointHint: '',
    },
  },
  /*
   * https://docs.wasabi.com/docs/signing-up-for-wasabi
   * https://docs.wasabi.com/docs/working-with-buckets-and-objects
   * https://docs.wasabi.com/docs/what-are-the-service-urls-for-wasabi-s-different-storage-regions
   * https://docs.wasabi.com/docs/how-do-i-create-a-sub-user-with-console-access-and-access-and-secret-keys
   * https://docs.wasabi.com/docs/creating-a-new-access-key
   * https://docs.wasabi.com/docs/how-to-separate-access-at-a-bucket-level
   */
  {
    id: 'wasabi',
    label: 'Wasabi',
    endpointTemplate: 'https://s3.{}.wasabisys.com',
    endpointFieldLabel: 'Region (eu-central-1, us-east-1)',
    regionFieldLabel: '',
    regionFromEndpointField: true,
    defaultRegion: 'eu-central-1',
    volumeClass: 'PAID',
    freeQuotaBytes: 0,
    egress: 'FREE',
    minimumRetentionDays: 90,
    note: 'Egress included, but a file deleted early still bills for its full 90 days.',
    setup: {
      signupUrl: 'https://wasabi.com/sign-up',
      docsUrl: 'https://docs.wasabi.com/docs/how-to-separate-access-at-a-bucket-level',
      account: [
        'Fill in the sign-up form and click Get Started. This starts a free trial; after it Wasabi bills a minimum of 1 TB a month.',
        'In the Welcome to Wasabi email, click Create Account and set a password.',
        'Set up multi-factor authentication - a trial account requires it.',
      ],
      bucket: [
        'Click Buckets, then Create Bucket.',
        'Enter a name: 3 to 63 lowercase letters, numbers, dots and dashes.',
        'Select the region - its code and address are shown beside the name.',
        'Click Create. Wasabi buckets are private by default.',
      ],
      key: [
        'Click Policies, then Create Policy, and paste the policy below.',
        ONE_BUCKET_POLICY_STEP,
        'Click Users, then Create User. Enter a name and give it programmatic (API) access only.',
        'Skip the group, attach your policy with +, click Next, then Create User.',
        'Copy or download the Access Key and Secret Key shown at the end.',
      ],
      keyIdField: 'Access Key',
      secretField: 'Secret Key',
      secretShownOnce: true,
      endpointHint: 'Enter the region code you chose for the bucket, such as eu-central-1.',
    },
  },
  /*
   * https://docs.aws.amazon.com/accounts/latest/reference/sign-up-for-aws.html
   * https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html
   * https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html
   * https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html
   * https://docs.aws.amazon.com/IAM/latest/UserGuide/access-keys-admin-managed.html
   * https://docs.aws.amazon.com/general/latest/gr/s3.html
   * The Free account plan closes after six months and deletes the data 90
   * days later - a file area cannot live there.
   */
  {
    id: 's3',
    label: 'Amazon S3',
    endpointTemplate: 'https://s3.{}.amazonaws.com',
    endpointFieldLabel: 'Region (eu-central-1, us-east-1)',
    regionFieldLabel: '',
    regionFromEndpointField: true,
    defaultRegion: 'eu-central-1',
    volumeClass: 'PAID',
    freeQuotaBytes: 0,
    egress: 'METERED',
    minimumRetentionDays: 30,
    note: 'The expensive default: $0.09/GB of egress on top of storage.',
    setup: {
      signupUrl: 'https://signin.aws.amazon.com/signup?request_type=register',
      docsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html',
      account: [
        'Enter the root user email address and an AWS account name, then Verify email address.',
        'Enter the code, set the root password and choose Continue.',
        'Choose the Paid account plan. The Free plan closes the account after six months and deletes its data 90 days later.',
        'Enter contact and billing information, confirm by SMS, choose Basic support and Complete sign up.',
      ],
      bucket: [
        'Open the S3 console. In the navigation bar, choose the Region name and pick your Region.',
        'Choose General purpose buckets, then Create bucket, and enter a Bucket name.',
        'Leave Block Public Access settings for this bucket all on (the default).',
        'Choose Create bucket.',
      ],
      key: [
        'Open the IAM console, choose Users, then Create user. Enter a name and create it with no permissions.',
        'Open the user: Permissions tab > Add permissions > Create inline policy. Choose JSON and paste the policy below, then name it and choose Create policy.',
        ONE_BUCKET_POLICY_STEP,
        'On the Security credentials tab, under Access keys, choose Create access key, choose Other, then Create access key.',
        'On Retrieve access keys, choose Show or Download .csv file, then Done.',
      ],
      keyIdField: 'Access key',
      secretField: 'Secret access key',
      secretShownOnce: true,
      endpointHint:
        'Enter the Region code chosen in the navigation bar when the bucket was created, such as eu-central-1.',
    },
  },
  /*
   * https://github.com/minio/minio (archived 2026-04-25; binaries discontinued)
   * https://docs.min.io/aistor/installation/container/install/
   * https://docs.min.io/aistor/administration/console/managing-objects/
   * https://docs.min.io/aistor/administration/console/security-and-access/
   * A default install serves plain http on :9000, so the sysop enters the
   * whole URL rather than a host behind a fixed https://.
   */
  {
    id: 'minio',
    label: 'MinIO / self-hosted',
    endpointTemplate: '{}',
    endpointFieldLabel: 'Server URL (http://minio.example.net:9000)',
    regionFieldLabel: '',
    regionFromEndpointField: false,
    defaultRegion: 'us-east-1',
    volumeClass: 'FREE',
    freeQuotaBytes: 0,
    egress: 'FREE',
    minimumRetentionDays: 0,
    note: 'Your own server. No quota unless you set one.',
    setup: {
      signupUrl: 'https://www.min.io/download',
      docsUrl: 'https://docs.min.io/aistor/installation/container/install/',
      account: [
        'The free MinIO Community Edition is archived and no longer ships binaries. Its successor is AIStor Free: request its free license key from the download page.',
        'Start the server as the install guide shows (a container with the license file and a data folder). It serves the S3 API on port 9000 and the console on 9001.',
        'Open the console at http://your-host:9001, sign in, and change the default minioadmin password at once.',
      ],
      bucket: [
        'Open Buckets in the console and select Add Bucket.',
        'Enter the Bucket Name, leave versioning and locking off, and create it.',
      ],
      key: [
        'Go to IAM Policies > + Add Policy and paste the policy below in Raw Format.',
        ONE_BUCKET_POLICY_STEP,
        'Go to IAM Users > + Add a user and give it that policy.',
        'Signed in as that user, go to Access Keys > Create Access Key. Save the access key and its password (the secret), then click Create.',
      ],
      keyIdField: 'Access Key',
      secretField: 'Secret Key',
      secretShownOnce: true,
      endpointHint:
        'Enter the address clients reach the S3 API on, port 9000 by default - not the 9001 console. Use http:// unless the server has a certificate.',
    },
  },
];

export function providerById(id: string): StorageProvider | undefined {
  return STORAGE_PROVIDERS.find(p => p.id === id);
}

/** Fill a provider's endpoint template: the sysop's value in `{}`, the region in `{region}`. */
export function buildEndpoint(provider: StorageProvider, fill: string, region = ''): string | null {
  if (!provider.endpointTemplate) return null;
  return provider.endpointTemplate
    .replace('{region}', region.trim() || provider.defaultRegion)
    .replace('{}', fill.trim());
}
