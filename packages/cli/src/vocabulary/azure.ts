/**
 * Azure (azurerm) vocabulary. Kept in its own provider module — not merged
 * into the AWS `AwsResource`/`AwsAttribute` enums — so each cloud's `spec.ts`
 * reads in its own idiom and the enums stay small ("Prose as Code"). The
 * shared `AnyResource`/`AnyAttribute` unions (in ./index) let the
 * cloud-neutral engine accept every provider's vocabulary.
 */

export enum AzureResource {
  NetworkSecurityGroup = 'azurerm_network_security_group',
  // Standalone NSG rule (the decomposed form of an inline `security_rule`).
  NetworkSecurityRule = 'azurerm_network_security_rule',
  StorageAccount = 'azurerm_storage_account',
  MssqlServer = 'azurerm_mssql_server',
  KeyVault = 'azurerm_key_vault',
  KubernetesCluster = 'azurerm_kubernetes_cluster',
  LinuxWebApp = 'azurerm_linux_web_app',
  WindowsWebApp = 'azurerm_windows_web_app',
  PostgresqlServer = 'azurerm_postgresql_server',
  MysqlServer = 'azurerm_mysql_server',
  ContainerRegistry = 'azurerm_container_registry',
  CosmosdbAccount = 'azurerm_cosmosdb_account',
  RoleDefinition = 'azurerm_role_definition',
  RoleAssignment = 'azurerm_role_assignment',
  ManagedDisk = 'azurerm_managed_disk',
  MonitorDiagnosticSetting = 'azurerm_monitor_diagnostic_setting',
  ApiManagement = 'azurerm_api_management',
  // Azure Functions (serverless). v4 preferrred `linux/windows_function_app`;
  // `function_app` is the legacy v3 combined resource. `https_only`,
  // `public_network_access_enabled`, and the `identity {}` block are shared
  // with Linux/Windows web apps; `site_config.minimum_tls_version` is the
  // function-app TLS floor.
  LinuxFunctionApp = 'azurerm_linux_function_app',
  WindowsFunctionApp = 'azurerm_windows_function_app',
  FunctionApp = 'azurerm_function_app',
}

export enum AzureAttribute {
  // Storage account
  AllowNestedItemsToBePublic = 'allow_nested_items_to_be_public',
  MinTlsVersion = 'min_tls_version',
  PublicNetworkAccessEnabled = 'public_network_access_enabled',
  // MSSQL server
  MinimumTlsVersion = 'minimum_tls_version',
  AdministratorLoginPassword = 'administrator_login_password',
  // Key Vault
  PurgeProtectionEnabled = 'purge_protection_enabled',
  // AKS
  PrivateClusterEnabled = 'private_cluster_enabled',
  LocalAccountDisabled = 'local_account_disabled',
  // App Service (Linux/Windows web app)
  HttpsOnly = 'https_only',
  // PostgreSQL / MySQL single server
  SslEnforcementEnabled = 'ssl_enforcement_enabled',
  // Container Registry
  AdminEnabled = 'admin_enabled',
  // RBAC (role_definition permissions block flattens to a list)
  RoleActions = 'permissions.actions',
  RoleDefinitionName = 'role_definition_name',
  // Network default-deny (nested) + CMK + diagnostic association
  NetworkRulesDefaultAction = 'network_rules.default_action',
  NetworkAclsDefaultAction = 'network_acls.default_action',
  DiskEncryptionSetId = 'disk_encryption_set_id',
  TargetResourceId = 'target_resource_id',
  // API Management legacy protocol toggles (nested under `security`)
  EnableFrontendTls10 = 'security.enable_frontend_tls10',
  EnableFrontendTls11 = 'security.enable_frontend_tls11',
  EnableBackendSsl30 = 'security.enable_backend_ssl30',
  // Azure Functions — site_config TLS floor (nested block, dotted).
  SiteConfigMinTlsVersion = 'site_config.minimum_tls_version',
}

// Built-in Azure roles that grant broad control (for denyValue on an
// azurerm_role_assignment).
export enum BuiltInRole {
  Owner = 'Owner',
  Contributor = 'Contributor',
}

// The secure default_action for storage/key-vault network rules.
export enum NetworkDefaultAction {
  Deny = 'Deny',
}

// Storage account TLS floor (note the storage-specific `TLS1_2` spelling).
export enum StorageTlsVersion {
  Tls12 = 'TLS1_2',
}

// MSSQL server TLS versions (a bare numeric string, unlike storage).
export enum SqlTlsVersion {
  V10 = '1.0',
  V11 = '1.1',
  V12 = '1.2',
}
