Pod::Spec.new do |s|
  s.name           = 'CurfyStoreKit'
  s.version        = '1.0.0'
  s.summary        = 'Curfy on-device verified StoreKit 2 non-consumable purchase'
  s.description    = 'Local native module for the Curfy Premium one-time purchase.'
  s.author         = 'Curfy'
  s.homepage       = 'https://github.com/alvinkwak01/curfy'
  s.license        = { :type => 'Proprietary', :text => 'Curfy application module. All rights reserved; no reuse license is granted.' }
  s.platform       = :ios, '15.2'
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
