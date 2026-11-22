{{- define "cloudhal.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "cloudhal.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "cloudhal.selector" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: cloudhal
{{- end -}}

{{- define "cloudhal.storeSelector" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: store
{{- end -}}

{{- define "cloudhal.secretName" -}}
{{- .Values.secrets.existingSecret | default (include "cloudhal.fullname" .) -}}
{{- end -}}

{{- define "cloudhal.storeEndpoint" -}}
{{- if .Values.store.enabled -}}
{{- printf "http://%s-store:8333" (include "cloudhal.fullname" .) -}}
{{- else -}}
{{- required "external.endpoint is required when store.enabled is false" .Values.external.endpoint -}}
{{- end -}}
{{- end -}}

{{- define "cloudhal.behindProxy" -}}
{{- if or .Values.behindProxy .Values.ingress.enabled .Values.httpRoute.enabled -}}1{{- else -}}0{{- end -}}
{{- end -}}

{{/* The keys every installation needs, in the Secret. */}}
{{- define "cloudhal.secretKeys" -}}
CLOUDHAL_CLUSTER_KEY BETTER_AUTH_SECRET MCP_STATE_KEY CLOUDHAL_PREVIEW_SECRET CLOUDHAL_PURGE_TOKEN CLOUDHAL_DEPLOY_TOKEN CLOUDHAL_SETUP_TOKEN CLOUDHAL_COMMENTS_KEY AWS_SECRET_ACCESS_KEY
{{- end -}}
