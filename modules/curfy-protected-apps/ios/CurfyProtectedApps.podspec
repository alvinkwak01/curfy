Pod::Spec.new do |s|
  s.name             = 'CurfyProtectedApps'
  s.version          = '1.0.0'
  s.summary          = 'Private, native UI for choosing Curfy-protected applications'
  s.description      = 'Displays FamilyControls ApplicationTokens without exposing app identities to React Native.'
  s.author           = 'Curfy'
  s.homepage         = 'https://github.com/alvinkwak01/curfy'
  s.license          = { :type => 'Proprietary', :text => 'Curfy application module. All rights reserved; no reuse license is granted.' }
  s.platform         = :ios, '15.1'
  s.source           = { :git => '' }
  s.static_framework = true
  s.swift_version    = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files     = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
