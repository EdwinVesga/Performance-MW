/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 545.0, "minX": 0.0, "maxY": 24186.0, "series": [{"data": [[0.0, 545.0], [0.1, 658.0], [0.2, 723.0], [0.3, 810.0], [0.4, 868.0], [0.5, 913.0], [0.6, 941.0], [0.7, 1043.0], [0.8, 1062.0], [0.9, 1171.0], [1.0, 1260.0], [1.1, 1298.0], [1.2, 1318.0], [1.3, 1369.0], [1.4, 1444.0], [1.5, 1983.0], [1.6, 2146.0], [1.7, 2199.0], [1.8, 2251.0], [1.9, 2317.0], [2.0, 2391.0], [2.1, 2474.0], [2.2, 2542.0], [2.3, 2602.0], [2.4, 2628.0], [2.5, 2639.0], [2.6, 2821.0], [2.7, 2891.0], [2.8, 2952.0], [2.9, 3060.0], [3.0, 3100.0], [3.1, 3197.0], [3.2, 3214.0], [3.3, 3255.0], [3.4, 3273.0], [3.5, 3289.0], [3.6, 3324.0], [3.7, 3330.0], [3.8, 3373.0], [3.9, 3392.0], [4.0, 3413.0], [4.1, 3424.0], [4.2, 3438.0], [4.3, 3491.0], [4.4, 3524.0], [4.5, 3559.0], [4.6, 3598.0], [4.7, 3626.0], [4.8, 3663.0], [4.9, 3681.0], [5.0, 3721.0], [5.1, 3751.0], [5.2, 3774.0], [5.3, 3825.0], [5.4, 3844.0], [5.5, 3876.0], [5.6, 3895.0], [5.7, 3902.0], [5.8, 3918.0], [5.9, 3932.0], [6.0, 3976.0], [6.1, 3992.0], [6.2, 4008.0], [6.3, 4026.0], [6.4, 4046.0], [6.5, 4075.0], [6.6, 4099.0], [6.7, 4114.0], [6.8, 4126.0], [6.9, 4159.0], [7.0, 4170.0], [7.1, 4182.0], [7.2, 4203.0], [7.3, 4231.0], [7.4, 4280.0], [7.5, 4292.0], [7.6, 4305.0], [7.7, 4324.0], [7.8, 4333.0], [7.9, 4350.0], [8.0, 4372.0], [8.1, 4378.0], [8.2, 4400.0], [8.3, 4440.0], [8.4, 4454.0], [8.5, 4483.0], [8.6, 4493.0], [8.7, 4512.0], [8.8, 4539.0], [8.9, 4544.0], [9.0, 4572.0], [9.1, 4581.0], [9.2, 4585.0], [9.3, 4610.0], [9.4, 4628.0], [9.5, 4640.0], [9.6, 4659.0], [9.7, 4668.0], [9.8, 4700.0], [9.9, 4710.0], [10.0, 4733.0], [10.1, 4738.0], [10.2, 4751.0], [10.3, 4758.0], [10.4, 4772.0], [10.5, 4785.0], [10.6, 4811.0], [10.7, 4832.0], [10.8, 4851.0], [10.9, 4883.0], [11.0, 4920.0], [11.1, 4930.0], [11.2, 4947.0], [11.3, 4979.0], [11.4, 5017.0], [11.5, 5036.0], [11.6, 5046.0], [11.7, 5068.0], [11.8, 5118.0], [11.9, 5136.0], [12.0, 5150.0], [12.1, 5158.0], [12.2, 5163.0], [12.3, 5190.0], [12.4, 5196.0], [12.5, 5222.0], [12.6, 5233.0], [12.7, 5241.0], [12.8, 5244.0], [12.9, 5265.0], [13.0, 5272.0], [13.1, 5283.0], [13.2, 5288.0], [13.3, 5292.0], [13.4, 5297.0], [13.5, 5313.0], [13.6, 5331.0], [13.7, 5345.0], [13.8, 5358.0], [13.9, 5361.0], [14.0, 5370.0], [14.1, 5412.0], [14.2, 5424.0], [14.3, 5463.0], [14.4, 5486.0], [14.5, 5495.0], [14.6, 5520.0], [14.7, 5526.0], [14.8, 5535.0], [14.9, 5567.0], [15.0, 5586.0], [15.1, 5603.0], [15.2, 5623.0], [15.3, 5656.0], [15.4, 5676.0], [15.5, 5708.0], [15.6, 5731.0], [15.7, 5762.0], [15.8, 5790.0], [15.9, 5796.0], [16.0, 5815.0], [16.1, 5827.0], [16.2, 5858.0], [16.3, 5893.0], [16.4, 5912.0], [16.5, 5949.0], [16.6, 5959.0], [16.7, 5972.0], [16.8, 6021.0], [16.9, 6059.0], [17.0, 6086.0], [17.1, 6121.0], [17.2, 6125.0], [17.3, 6164.0], [17.4, 6174.0], [17.5, 6212.0], [17.6, 6231.0], [17.7, 6260.0], [17.8, 6294.0], [17.9, 6300.0], [18.0, 6317.0], [18.1, 6343.0], [18.2, 6363.0], [18.3, 6393.0], [18.4, 6452.0], [18.5, 6478.0], [18.6, 6486.0], [18.7, 6508.0], [18.8, 6537.0], [18.9, 6575.0], [19.0, 6599.0], [19.1, 6633.0], [19.2, 6677.0], [19.3, 6709.0], [19.4, 6719.0], [19.5, 6735.0], [19.6, 6738.0], [19.7, 6768.0], [19.8, 6795.0], [19.9, 6830.0], [20.0, 6849.0], [20.1, 6889.0], [20.2, 6939.0], [20.3, 7000.0], [20.4, 7004.0], [20.5, 7035.0], [20.6, 7046.0], [20.7, 7098.0], [20.8, 7114.0], [20.9, 7121.0], [21.0, 7139.0], [21.1, 7148.0], [21.2, 7179.0], [21.3, 7201.0], [21.4, 7211.0], [21.5, 7244.0], [21.6, 7255.0], [21.7, 7285.0], [21.8, 7315.0], [21.9, 7331.0], [22.0, 7340.0], [22.1, 7359.0], [22.2, 7391.0], [22.3, 7418.0], [22.4, 7434.0], [22.5, 7443.0], [22.6, 7477.0], [22.7, 7506.0], [22.8, 7521.0], [22.9, 7538.0], [23.0, 7549.0], [23.1, 7571.0], [23.2, 7598.0], [23.3, 7615.0], [23.4, 7640.0], [23.5, 7663.0], [23.6, 7667.0], [23.7, 7685.0], [23.8, 7705.0], [23.9, 7732.0], [24.0, 7737.0], [24.1, 7758.0], [24.2, 7791.0], [24.3, 7795.0], [24.4, 7810.0], [24.5, 7849.0], [24.6, 7866.0], [24.7, 7879.0], [24.8, 7912.0], [24.9, 7934.0], [25.0, 7952.0], [25.1, 7959.0], [25.2, 7997.0], [25.3, 8009.0], [25.4, 8034.0], [25.5, 8039.0], [25.6, 8054.0], [25.7, 8068.0], [25.8, 8079.0], [25.9, 8101.0], [26.0, 8108.0], [26.1, 8119.0], [26.2, 8143.0], [26.3, 8162.0], [26.4, 8189.0], [26.5, 8208.0], [26.6, 8226.0], [26.7, 8241.0], [26.8, 8251.0], [26.9, 8274.0], [27.0, 8286.0], [27.1, 8295.0], [27.2, 8329.0], [27.3, 8337.0], [27.4, 8349.0], [27.5, 8356.0], [27.6, 8384.0], [27.7, 8403.0], [27.8, 8422.0], [27.9, 8436.0], [28.0, 8481.0], [28.1, 8511.0], [28.2, 8520.0], [28.3, 8537.0], [28.4, 8540.0], [28.5, 8551.0], [28.6, 8564.0], [28.7, 8594.0], [28.8, 8614.0], [28.9, 8635.0], [29.0, 8664.0], [29.1, 8668.0], [29.2, 8701.0], [29.3, 8734.0], [29.4, 8776.0], [29.5, 8791.0], [29.6, 8824.0], [29.7, 8842.0], [29.8, 8852.0], [29.9, 8888.0], [30.0, 8906.0], [30.1, 8948.0], [30.2, 8955.0], [30.3, 8973.0], [30.4, 8984.0], [30.5, 9018.0], [30.6, 9037.0], [30.7, 9068.0], [30.8, 9114.0], [30.9, 9138.0], [31.0, 9153.0], [31.1, 9166.0], [31.2, 9177.0], [31.3, 9196.0], [31.4, 9239.0], [31.5, 9245.0], [31.6, 9267.0], [31.7, 9277.0], [31.8, 9330.0], [31.9, 9363.0], [32.0, 9376.0], [32.1, 9397.0], [32.2, 9403.0], [32.3, 9410.0], [32.4, 9455.0], [32.5, 9481.0], [32.6, 9515.0], [32.7, 9539.0], [32.8, 9549.0], [32.9, 9574.0], [33.0, 9642.0], [33.1, 9688.0], [33.2, 9719.0], [33.3, 9786.0], [33.4, 9800.0], [33.5, 9845.0], [33.6, 9870.0], [33.7, 9888.0], [33.8, 9967.0], [33.9, 10004.0], [34.0, 10036.0], [34.1, 10056.0], [34.2, 10083.0], [34.3, 10098.0], [34.4, 10119.0], [34.5, 10151.0], [34.6, 10182.0], [34.7, 10232.0], [34.8, 10260.0], [34.9, 10273.0], [35.0, 10317.0], [35.1, 10346.0], [35.2, 10376.0], [35.3, 10386.0], [35.4, 10408.0], [35.5, 10422.0], [35.6, 10453.0], [35.7, 10472.0], [35.8, 10510.0], [35.9, 10564.0], [36.0, 10593.0], [36.1, 10636.0], [36.2, 10678.0], [36.3, 10753.0], [36.4, 10762.0], [36.5, 10840.0], [36.6, 10909.0], [36.7, 10928.0], [36.8, 11017.0], [36.9, 11080.0], [37.0, 11105.0], [37.1, 11125.0], [37.2, 11191.0], [37.3, 11244.0], [37.4, 11261.0], [37.5, 11330.0], [37.6, 11343.0], [37.7, 11348.0], [37.8, 11365.0], [37.9, 11380.0], [38.0, 11390.0], [38.1, 11426.0], [38.2, 11461.0], [38.3, 11503.0], [38.4, 11532.0], [38.5, 11579.0], [38.6, 11625.0], [38.7, 11642.0], [38.8, 11655.0], [38.9, 11674.0], [39.0, 11702.0], [39.1, 11742.0], [39.2, 11775.0], [39.3, 11787.0], [39.4, 11804.0], [39.5, 11818.0], [39.6, 11881.0], [39.7, 11916.0], [39.8, 11923.0], [39.9, 11949.0], [40.0, 11954.0], [40.1, 11975.0], [40.2, 11981.0], [40.3, 12006.0], [40.4, 12020.0], [40.5, 12029.0], [40.6, 12066.0], [40.7, 12082.0], [40.8, 12087.0], [40.9, 12098.0], [41.0, 12109.0], [41.1, 12127.0], [41.2, 12137.0], [41.3, 12153.0], [41.4, 12195.0], [41.5, 12204.0], [41.6, 12215.0], [41.7, 12239.0], [41.8, 12268.0], [41.9, 12276.0], [42.0, 12281.0], [42.1, 12293.0], [42.2, 12342.0], [42.3, 12380.0], [42.4, 12407.0], [42.5, 12427.0], [42.6, 12442.0], [42.7, 12453.0], [42.8, 12463.0], [42.9, 12477.0], [43.0, 12495.0], [43.1, 12506.0], [43.2, 12527.0], [43.3, 12531.0], [43.4, 12556.0], [43.5, 12568.0], [43.6, 12581.0], [43.7, 12598.0], [43.8, 12632.0], [43.9, 12649.0], [44.0, 12654.0], [44.1, 12664.0], [44.2, 12679.0], [44.3, 12695.0], [44.4, 12710.0], [44.5, 12731.0], [44.6, 12757.0], [44.7, 12768.0], [44.8, 12786.0], [44.9, 12797.0], [45.0, 12817.0], [45.1, 12848.0], [45.2, 12852.0], [45.3, 12869.0], [45.4, 12874.0], [45.5, 12910.0], [45.6, 12918.0], [45.7, 12924.0], [45.8, 12948.0], [45.9, 12968.0], [46.0, 12989.0], [46.1, 13007.0], [46.2, 13035.0], [46.3, 13037.0], [46.4, 13088.0], [46.5, 13109.0], [46.6, 13119.0], [46.7, 13126.0], [46.8, 13139.0], [46.9, 13183.0], [47.0, 13208.0], [47.1, 13222.0], [47.2, 13233.0], [47.3, 13248.0], [47.4, 13288.0], [47.5, 13312.0], [47.6, 13319.0], [47.7, 13335.0], [47.8, 13354.0], [47.9, 13381.0], [48.0, 13396.0], [48.1, 13405.0], [48.2, 13415.0], [48.3, 13479.0], [48.4, 13482.0], [48.5, 13490.0], [48.6, 13497.0], [48.7, 13514.0], [48.8, 13533.0], [48.9, 13538.0], [49.0, 13560.0], [49.1, 13591.0], [49.2, 13629.0], [49.3, 13658.0], [49.4, 13678.0], [49.5, 13711.0], [49.6, 13728.0], [49.7, 13736.0], [49.8, 13760.0], [49.9, 13785.0], [50.0, 13801.0], [50.1, 13822.0], [50.2, 13848.0], [50.3, 13879.0], [50.4, 13905.0], [50.5, 13912.0], [50.6, 13944.0], [50.7, 13952.0], [50.8, 13978.0], [50.9, 13993.0], [51.0, 14019.0], [51.1, 14033.0], [51.2, 14099.0], [51.3, 14117.0], [51.4, 14129.0], [51.5, 14152.0], [51.6, 14163.0], [51.7, 14168.0], [51.8, 14183.0], [51.9, 14221.0], [52.0, 14228.0], [52.1, 14302.0], [52.2, 14329.0], [52.3, 14371.0], [52.4, 14389.0], [52.5, 14402.0], [52.6, 14468.0], [52.7, 14509.0], [52.8, 14548.0], [52.9, 14577.0], [53.0, 14584.0], [53.1, 14594.0], [53.2, 14615.0], [53.3, 14629.0], [53.4, 14638.0], [53.5, 14642.0], [53.6, 14654.0], [53.7, 14695.0], [53.8, 14705.0], [53.9, 14734.0], [54.0, 14744.0], [54.1, 14765.0], [54.2, 14805.0], [54.3, 14811.0], [54.4, 14819.0], [54.5, 14851.0], [54.6, 14877.0], [54.7, 14892.0], [54.8, 14899.0], [54.9, 14919.0], [55.0, 14940.0], [55.1, 14962.0], [55.2, 15008.0], [55.3, 15028.0], [55.4, 15058.0], [55.5, 15077.0], [55.6, 15093.0], [55.7, 15112.0], [55.8, 15141.0], [55.9, 15187.0], [56.0, 15247.0], [56.1, 15305.0], [56.2, 15366.0], [56.3, 15411.0], [56.4, 15475.0], [56.5, 15512.0], [56.6, 15540.0], [56.7, 15553.0], [56.8, 15582.0], [56.9, 15630.0], [57.0, 15635.0], [57.1, 15677.0], [57.2, 15705.0], [57.3, 15738.0], [57.4, 15783.0], [57.5, 15802.0], [57.6, 15835.0], [57.7, 15863.0], [57.8, 15890.0], [57.9, 15914.0], [58.0, 15939.0], [58.1, 15945.0], [58.2, 15966.0], [58.3, 15996.0], [58.4, 16020.0], [58.5, 16048.0], [58.6, 16064.0], [58.7, 16079.0], [58.8, 16091.0], [58.9, 16102.0], [59.0, 16136.0], [59.1, 16151.0], [59.2, 16179.0], [59.3, 16243.0], [59.4, 16266.0], [59.5, 16296.0], [59.6, 16316.0], [59.7, 16326.0], [59.8, 16348.0], [59.9, 16376.0], [60.0, 16406.0], [60.1, 16426.0], [60.2, 16430.0], [60.3, 16439.0], [60.4, 16453.0], [60.5, 16457.0], [60.6, 16490.0], [60.7, 16504.0], [60.8, 16518.0], [60.9, 16520.0], [61.0, 16546.0], [61.1, 16563.0], [61.2, 16569.0], [61.3, 16607.0], [61.4, 16653.0], [61.5, 16681.0], [61.6, 16701.0], [61.7, 16712.0], [61.8, 16721.0], [61.9, 16746.0], [62.0, 16778.0], [62.1, 16792.0], [62.2, 16808.0], [62.3, 16829.0], [62.4, 16833.0], [62.5, 16844.0], [62.6, 16853.0], [62.7, 16870.0], [62.8, 16883.0], [62.9, 16893.0], [63.0, 16924.0], [63.1, 16947.0], [63.2, 16966.0], [63.3, 16988.0], [63.4, 17016.0], [63.5, 17035.0], [63.6, 17040.0], [63.7, 17062.0], [63.8, 17088.0], [63.9, 17102.0], [64.0, 17110.0], [64.1, 17135.0], [64.2, 17156.0], [64.3, 17173.0], [64.4, 17193.0], [64.5, 17209.0], [64.6, 17214.0], [64.7, 17219.0], [64.8, 17233.0], [64.9, 17251.0], [65.0, 17265.0], [65.1, 17283.0], [65.2, 17314.0], [65.3, 17330.0], [65.4, 17364.0], [65.5, 17393.0], [65.6, 17395.0], [65.7, 17410.0], [65.8, 17418.0], [65.9, 17431.0], [66.0, 17438.0], [66.1, 17455.0], [66.2, 17460.0], [66.3, 17479.0], [66.4, 17518.0], [66.5, 17535.0], [66.6, 17555.0], [66.7, 17581.0], [66.8, 17591.0], [66.9, 17599.0], [67.0, 17614.0], [67.1, 17618.0], [67.2, 17630.0], [67.3, 17633.0], [67.4, 17659.0], [67.5, 17667.0], [67.6, 17691.0], [67.7, 17700.0], [67.8, 17711.0], [67.9, 17718.0], [68.0, 17736.0], [68.1, 17744.0], [68.2, 17771.0], [68.3, 17782.0], [68.4, 17811.0], [68.5, 17830.0], [68.6, 17849.0], [68.7, 17882.0], [68.8, 17903.0], [68.9, 17929.0], [69.0, 17951.0], [69.1, 17962.0], [69.2, 17982.0], [69.3, 17988.0], [69.4, 18025.0], [69.5, 18042.0], [69.6, 18053.0], [69.7, 18071.0], [69.8, 18110.0], [69.9, 18115.0], [70.0, 18128.0], [70.1, 18161.0], [70.2, 18175.0], [70.3, 18180.0], [70.4, 18217.0], [70.5, 18224.0], [70.6, 18239.0], [70.7, 18269.0], [70.8, 18274.0], [70.9, 18285.0], [71.0, 18311.0], [71.1, 18324.0], [71.2, 18375.0], [71.3, 18392.0], [71.4, 18412.0], [71.5, 18444.0], [71.6, 18468.0], [71.7, 18500.0], [71.8, 18523.0], [71.9, 18545.0], [72.0, 18574.0], [72.1, 18582.0], [72.2, 18591.0], [72.3, 18616.0], [72.4, 18632.0], [72.5, 18653.0], [72.6, 18682.0], [72.7, 18718.0], [72.8, 18755.0], [72.9, 18792.0], [73.0, 18805.0], [73.1, 18838.0], [73.2, 18848.0], [73.3, 18868.0], [73.4, 18877.0], [73.5, 18911.0], [73.6, 18929.0], [73.7, 18948.0], [73.8, 18966.0], [73.9, 19011.0], [74.0, 19063.0], [74.1, 19076.0], [74.2, 19099.0], [74.3, 19113.0], [74.4, 19115.0], [74.5, 19148.0], [74.6, 19186.0], [74.7, 19194.0], [74.8, 19202.0], [74.9, 19229.0], [75.0, 19246.0], [75.1, 19289.0], [75.2, 19331.0], [75.3, 19349.0], [75.4, 19367.0], [75.5, 19407.0], [75.6, 19453.0], [75.7, 19491.0], [75.8, 19535.0], [75.9, 19570.0], [76.0, 19587.0], [76.1, 19605.0], [76.2, 19638.0], [76.3, 19679.0], [76.4, 19719.0], [76.5, 19733.0], [76.6, 19752.0], [76.7, 19766.0], [76.8, 19842.0], [76.9, 19904.0], [77.0, 20070.0], [77.1, 20154.0], [77.2, 20204.0], [77.3, 20254.0], [77.4, 20316.0], [77.5, 20341.0], [77.6, 20367.0], [77.7, 20403.0], [77.8, 20445.0], [77.9, 20465.0], [78.0, 20482.0], [78.1, 20516.0], [78.2, 20535.0], [78.3, 20560.0], [78.4, 20588.0], [78.5, 20626.0], [78.6, 20658.0], [78.7, 20715.0], [78.8, 20750.0], [78.9, 20765.0], [79.0, 20779.0], [79.1, 20794.0], [79.2, 20832.0], [79.3, 20846.0], [79.4, 20877.0], [79.5, 20909.0], [79.6, 20921.0], [79.7, 20941.0], [79.8, 20957.0], [79.9, 20994.0], [80.0, 21012.0], [80.1, 21046.0], [80.2, 21063.0], [80.3, 21086.0], [80.4, 21107.0], [80.5, 21116.0], [80.6, 21134.0], [80.7, 21150.0], [80.8, 21153.0], [80.9, 21180.0], [81.0, 21198.0], [81.1, 21206.0], [81.2, 21218.0], [81.3, 21230.0], [81.4, 21248.0], [81.5, 21271.0], [81.6, 21280.0], [81.7, 21292.0], [81.8, 21310.0], [81.9, 21341.0], [82.0, 21371.0], [82.1, 21391.0], [82.2, 21411.0], [82.3, 21443.0], [82.4, 21465.0], [82.5, 21472.0], [82.6, 21487.0], [82.7, 21508.0], [82.8, 21517.0], [82.9, 21531.0], [83.0, 21538.0], [83.1, 21551.0], [83.2, 21592.0], [83.3, 21598.0], [83.4, 21602.0], [83.5, 21639.0], [83.6, 21643.0], [83.7, 21656.0], [83.8, 21666.0], [83.9, 21674.0], [84.0, 21693.0], [84.1, 21701.0], [84.2, 21719.0], [84.3, 21729.0], [84.4, 21792.0], [84.5, 21802.0], [84.6, 21828.0], [84.7, 21852.0], [84.8, 21872.0], [84.9, 21879.0], [85.0, 21892.0], [85.1, 21906.0], [85.2, 21913.0], [85.3, 21918.0], [85.4, 21929.0], [85.5, 21936.0], [85.6, 21944.0], [85.7, 21950.0], [85.8, 21964.0], [85.9, 21980.0], [86.0, 21989.0], [86.1, 22009.0], [86.2, 22018.0], [86.3, 22022.0], [86.4, 22031.0], [86.5, 22038.0], [86.6, 22048.0], [86.7, 22064.0], [86.8, 22076.0], [86.9, 22090.0], [87.0, 22098.0], [87.1, 22110.0], [87.2, 22130.0], [87.3, 22152.0], [87.4, 22155.0], [87.5, 22168.0], [87.6, 22176.0], [87.7, 22188.0], [87.8, 22193.0], [87.9, 22204.0], [88.0, 22211.0], [88.1, 22213.0], [88.2, 22224.0], [88.3, 22239.0], [88.4, 22243.0], [88.5, 22258.0], [88.6, 22268.0], [88.7, 22276.0], [88.8, 22290.0], [88.9, 22300.0], [89.0, 22314.0], [89.1, 22328.0], [89.2, 22351.0], [89.3, 22356.0], [89.4, 22365.0], [89.5, 22368.0], [89.6, 22370.0], [89.7, 22381.0], [89.8, 22389.0], [89.9, 22409.0], [90.0, 22430.0], [90.1, 22437.0], [90.2, 22448.0], [90.3, 22459.0], [90.4, 22474.0], [90.5, 22476.0], [90.6, 22488.0], [90.7, 22501.0], [90.8, 22517.0], [90.9, 22530.0], [91.0, 22542.0], [91.1, 22545.0], [91.2, 22562.0], [91.3, 22564.0], [91.4, 22579.0], [91.5, 22588.0], [91.6, 22596.0], [91.7, 22610.0], [91.8, 22616.0], [91.9, 22624.0], [92.0, 22644.0], [92.1, 22653.0], [92.2, 22658.0], [92.3, 22666.0], [92.4, 22680.0], [92.5, 22683.0], [92.6, 22687.0], [92.7, 22710.0], [92.8, 22713.0], [92.9, 22722.0], [93.0, 22727.0], [93.1, 22747.0], [93.2, 22748.0], [93.3, 22757.0], [93.4, 22764.0], [93.5, 22792.0], [93.6, 22801.0], [93.7, 22809.0], [93.8, 22824.0], [93.9, 22831.0], [94.0, 22834.0], [94.1, 22836.0], [94.2, 22840.0], [94.3, 22852.0], [94.4, 22871.0], [94.5, 22877.0], [94.6, 22885.0], [94.7, 22895.0], [94.8, 22912.0], [94.9, 22930.0], [95.0, 22937.0], [95.1, 22943.0], [95.2, 22967.0], [95.3, 22982.0], [95.4, 22991.0], [95.5, 23015.0], [95.6, 23034.0], [95.7, 23037.0], [95.8, 23048.0], [95.9, 23073.0], [96.0, 23075.0], [96.1, 23084.0], [96.2, 23099.0], [96.3, 23117.0], [96.4, 23129.0], [96.5, 23141.0], [96.6, 23165.0], [96.7, 23181.0], [96.8, 23192.0], [96.9, 23213.0], [97.0, 23245.0], [97.1, 23248.0], [97.2, 23284.0], [97.3, 23289.0], [97.4, 23295.0], [97.5, 23313.0], [97.6, 23334.0], [97.7, 23356.0], [97.8, 23372.0], [97.9, 23389.0], [98.0, 23415.0], [98.1, 23429.0], [98.2, 23459.0], [98.3, 23509.0], [98.4, 23531.0], [98.5, 23540.0], [98.6, 23546.0], [98.7, 23559.0], [98.8, 23584.0], [98.9, 23588.0], [99.0, 23625.0], [99.1, 23651.0], [99.2, 23673.0], [99.3, 23698.0], [99.4, 23729.0], [99.5, 23745.0], [99.6, 23831.0], [99.7, 23875.0], [99.8, 23953.0], [99.9, 24014.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 36.0, "series": [{"data": [[500.0, 1.0], [600.0, 5.0], [700.0, 3.0], [800.0, 4.0], [900.0, 8.0], [1000.0, 5.0], [1100.0, 2.0], [1200.0, 6.0], [1300.0, 7.0], [1400.0, 2.0], [1500.0, 1.0], [1900.0, 1.0], [2100.0, 6.0], [2300.0, 5.0], [2200.0, 4.0], [2400.0, 4.0], [2500.0, 4.0], [2600.0, 9.0], [2800.0, 5.0], [2900.0, 4.0], [3000.0, 4.0], [3100.0, 5.0], [3200.0, 13.0], [3300.0, 11.0], [3400.0, 11.0], [3500.0, 9.0], [3600.0, 11.0], [3700.0, 8.0], [3800.0, 13.0], [3900.0, 14.0], [4000.0, 14.0], [4100.0, 17.0], [4200.0, 11.0], [4300.0, 19.0], [4500.0, 18.0], [4400.0, 14.0], [4600.0, 16.0], [4800.0, 12.0], [4700.0, 23.0], [4900.0, 12.0], [5000.0, 13.0], [5100.0, 19.0], [5200.0, 31.0], [5300.0, 18.0], [5600.0, 11.0], [5400.0, 16.0], [5500.0, 15.0], [5700.0, 14.0], [5800.0, 12.0], [5900.0, 13.0], [6100.0, 12.0], [6000.0, 8.0], [6200.0, 13.0], [6300.0, 14.0], [6500.0, 10.0], [6400.0, 10.0], [6600.0, 7.0], [6700.0, 18.0], [6800.0, 8.0], [6900.0, 5.0], [7000.0, 13.0], [7100.0, 17.0], [7200.0, 15.0], [7400.0, 11.0], [7300.0, 14.0], [7500.0, 18.0], [7600.0, 17.0], [7700.0, 17.0], [7800.0, 11.0], [7900.0, 15.0], [8000.0, 20.0], [8100.0, 17.0], [8500.0, 21.0], [8200.0, 21.0], [8300.0, 16.0], [8600.0, 12.0], [8700.0, 11.0], [8400.0, 11.0], [8800.0, 14.0], [8900.0, 15.0], [9100.0, 17.0], [9000.0, 9.0], [9200.0, 12.0], [9300.0, 12.0], [9400.0, 13.0], [9500.0, 11.0], [9700.0, 7.0], [9600.0, 6.0], [9800.0, 10.0], [10200.0, 10.0], [10000.0, 13.0], [10100.0, 10.0], [9900.0, 5.0], [10300.0, 12.0], [10400.0, 12.0], [10500.0, 8.0], [10600.0, 7.0], [10700.0, 4.0], [10900.0, 6.0], [10800.0, 5.0], [11000.0, 4.0], [11100.0, 9.0], [11200.0, 6.0], [11500.0, 9.0], [11400.0, 8.0], [11300.0, 18.0], [11700.0, 11.0], [11600.0, 12.0], [11800.0, 8.0], [11900.0, 19.0], [12000.0, 20.0], [12100.0, 17.0], [12200.0, 20.0], [12500.0, 21.0], [12700.0, 18.0], [12400.0, 20.0], [12600.0, 18.0], [12300.0, 6.0], [13100.0, 13.0], [12900.0, 17.0], [13200.0, 15.0], [13300.0, 19.0], [12800.0, 17.0], [13000.0, 14.0], [13500.0, 15.0], [13600.0, 10.0], [13400.0, 17.0], [13700.0, 15.0], [13800.0, 12.0], [13900.0, 17.0], [14000.0, 9.0], [14100.0, 18.0], [14300.0, 12.0], [14200.0, 8.0], [14500.0, 16.0], [14400.0, 4.0], [14700.0, 13.0], [14800.0, 20.0], [14600.0, 17.0], [15000.0, 15.0], [14900.0, 9.0], [15100.0, 10.0], [15300.0, 6.0], [15200.0, 4.0], [15500.0, 12.0], [15600.0, 9.0], [15400.0, 6.0], [15800.0, 13.0], [15700.0, 8.0], [15900.0, 14.0], [16000.0, 16.0], [16100.0, 11.0], [16300.0, 12.0], [16200.0, 8.0], [17200.0, 21.0], [16400.0, 23.0], [16600.0, 10.0], [17000.0, 16.0], [16800.0, 24.0], [17400.0, 23.0], [18200.0, 20.0], [17600.0, 22.0], [18000.0, 12.0], [17800.0, 13.0], [18400.0, 11.0], [19200.0, 12.0], [18600.0, 11.0], [18800.0, 17.0], [19000.0, 11.0], [19400.0, 8.0], [19600.0, 8.0], [19800.0, 5.0], [20200.0, 4.0], [20400.0, 11.0], [20000.0, 2.0], [20800.0, 11.0], [21200.0, 22.0], [20600.0, 7.0], [21400.0, 16.0], [21000.0, 13.0], [22000.0, 28.0], [21600.0, 21.0], [22200.0, 30.0], [21800.0, 18.0], [22400.0, 26.0], [22800.0, 36.0], [23000.0, 24.0], [22600.0, 32.0], [23200.0, 17.0], [23400.0, 11.0], [23800.0, 5.0], [23600.0, 12.0], [24000.0, 2.0], [16500.0, 17.0], [17100.0, 17.0], [16900.0, 12.0], [17300.0, 14.0], [16700.0, 17.0], [17500.0, 17.0], [17700.0, 20.0], [17900.0, 17.0], [18100.0, 17.0], [18300.0, 10.0], [18500.0, 18.0], [18700.0, 8.0], [19100.0, 15.0], [18900.0, 11.0], [19300.0, 11.0], [19500.0, 10.0], [19700.0, 11.0], [20300.0, 11.0], [19900.0, 2.0], [20100.0, 5.0], [20500.0, 12.0], [20700.0, 13.0], [20900.0, 13.0], [21100.0, 20.0], [21500.0, 20.0], [21300.0, 12.0], [21900.0, 31.0], [21700.0, 12.0], [22500.0, 28.0], [22100.0, 26.0], [22300.0, 28.0], [22700.0, 26.0], [23300.0, 15.0], [23100.0, 19.0], [22900.0, 20.0], [23500.0, 19.0], [23700.0, 7.0], [23900.0, 4.0], [24100.0, 2.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 24100.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 43.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2957.0, "series": [{"data": [[1.0, 43.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2957.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 1221.3787878787875, "minX": 1.54960824E12, "maxY": 1495.3960573476695, "series": [{"data": [[1.54960824E12, 1495.3960573476695], [1.5496083E12, 1221.3787878787875]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496083E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 3884.0, "minX": 1.0, "maxY": 24186.0, "series": [{"data": [[2.0, 23644.0], [4.0, 23379.0], [6.0, 23133.5], [7.0, 23673.0], [8.0, 23277.0], [9.0, 23380.0], [10.0, 22806.0], [11.0, 22910.0], [12.0, 23711.0], [14.0, 23144.5], [15.0, 23287.0], [16.0, 23525.0], [17.0, 24186.0], [18.0, 22883.0], [19.0, 22963.0], [20.0, 23356.0], [21.0, 23380.0], [22.0, 23573.0], [23.0, 23429.0], [24.0, 23213.0], [26.0, 22831.0], [27.0, 23260.5], [28.0, 23289.0], [29.0, 22748.0], [31.0, 23581.5], [32.0, 22802.0], [34.0, 23289.5], [37.0, 23459.0], [36.0, 22979.0], [39.0, 23447.0], [38.0, 23695.0], [41.0, 23408.0], [40.0, 23997.0], [43.0, 23380.0], [45.0, 23106.5], [47.0, 23389.0], [46.0, 23585.0], [49.0, 23248.0], [48.0, 22867.0], [51.0, 23284.0], [50.0, 23875.0], [53.0, 23668.0], [52.0, 23212.0], [55.0, 23484.0], [57.0, 23117.0], [56.0, 22717.0], [59.0, 23509.0], [58.0, 23268.0], [61.0, 23175.0], [63.0, 23165.0], [62.0, 23925.0], [67.0, 22686.0], [66.0, 23850.0], [65.0, 22742.0], [64.0, 23624.0], [71.0, 22836.0], [70.0, 23444.0], [69.0, 23831.0], [68.0, 24007.0], [75.0, 22710.0], [74.0, 22912.0], [73.0, 23606.5], [79.0, 23448.0], [77.0, 23178.0], [76.0, 22967.0], [83.0, 22658.0], [82.0, 23289.0], [81.0, 23544.0], [80.0, 23285.0], [86.0, 23516.0], [85.0, 23041.0], [84.0, 23537.0], [91.0, 23181.0], [90.0, 24014.0], [89.0, 22826.0], [88.0, 23535.0], [95.0, 23307.0], [94.0, 23295.0], [93.0, 22809.0], [92.0, 22792.0], [99.0, 22693.0], [98.0, 23472.0], [97.0, 23920.0], [96.0, 23192.0], [103.0, 23034.0], [102.0, 22758.0], [101.0, 22871.0], [100.0, 23076.0], [107.0, 22987.0], [106.0, 23479.0], [105.0, 23546.0], [104.0, 23245.0], [111.0, 22611.0], [110.0, 23099.0], [109.0, 23141.0], [108.0, 22580.0], [115.0, 22683.0], [114.0, 23742.0], [113.0, 23742.0], [112.0, 22671.0], [119.0, 22969.0], [118.0, 22835.0], [117.0, 23109.0], [116.0, 23148.0], [123.0, 23584.0], [122.0, 23017.0], [121.0, 23848.0], [120.0, 23234.0], [127.0, 22774.0], [126.0, 23415.0], [125.0, 23345.0], [135.0, 23604.0], [134.0, 22727.0], [133.0, 22747.0], [132.0, 23015.0], [131.0, 22546.0], [130.0, 22722.0], [129.0, 23559.0], [128.0, 22748.0], [143.0, 22887.0], [142.0, 22938.0], [141.0, 23405.0], [140.0, 22666.0], [139.0, 22711.0], [138.0, 23087.0], [137.0, 22484.0], [136.0, 22648.0], [151.0, 22775.0], [150.0, 22882.0], [149.0, 23036.0], [148.0, 22836.0], [147.0, 22675.0], [146.0, 22801.0], [145.0, 22838.0], [144.0, 23294.0], [159.0, 23187.0], [158.0, 22596.0], [157.0, 22761.0], [156.0, 23371.0], [155.0, 23661.0], [154.0, 22644.0], [153.0, 23544.0], [152.0, 22885.0], [165.0, 11741.0], [167.0, 8209.333333333332], [166.0, 11502.0], [164.0, 22365.0], [163.0, 23560.0], [162.0, 22680.0], [161.0, 23073.0], [160.0, 22982.0], [169.0, 11990.0], [175.0, 23729.0], [174.0, 22764.0], [173.0, 22933.0], [172.0, 22311.0], [171.0, 22564.0], [170.0, 22535.0], [168.0, 22604.0], [181.0, 11594.0], [180.0, 11984.0], [183.0, 22579.0], [182.0, 23075.0], [179.0, 23059.0], [178.0, 22565.0], [177.0, 22588.0], [176.0, 22834.0], [185.0, 11683.5], [191.0, 22653.0], [190.0, 22586.0], [189.0, 22991.0], [188.0, 23548.0], [187.0, 22365.0], [186.0, 23586.0], [184.0, 22616.0], [199.0, 23074.0], [198.0, 22610.0], [197.0, 22545.0], [196.0, 22620.0], [195.0, 22845.0], [194.0, 22294.0], [193.0, 22328.0], [192.0, 22895.0], [202.0, 11582.0], [207.0, 11931.5], [206.0, 22382.0], [205.0, 22351.0], [204.0, 22449.0], [203.0, 23640.0], [201.0, 23340.0], [200.0, 22628.0], [215.0, 22188.0], [214.0, 22476.0], [213.0, 23075.0], [212.0, 23549.0], [211.0, 22181.0], [210.0, 22722.0], [209.0, 22488.0], [208.0, 22290.0], [223.0, 22185.0], [222.0, 22895.0], [221.0, 22569.0], [220.0, 22554.0], [219.0, 22930.0], [218.0, 22926.0], [217.0, 23334.0], [216.0, 22852.0], [231.0, 22660.0], [230.0, 23329.0], [229.0, 22682.0], [228.0, 22657.0], [227.0, 22875.0], [226.0, 23428.0], [225.0, 23036.0], [224.0, 22936.0], [239.0, 22713.0], [238.0, 22501.0], [237.0, 22401.0], [236.0, 22624.0], [235.0, 22697.0], [234.0, 22683.0], [233.0, 22476.0], [232.0, 22723.0], [240.0, 8249.333333333332], [242.0, 7968.333333333333], [241.0, 8133.0], [247.0, 22877.0], [246.0, 22155.0], [245.0, 22495.0], [244.0, 22206.5], [250.0, 8244.333333333332], [251.0, 11675.5], [255.0, 22529.0], [254.0, 23197.0], [253.0, 22211.0], [252.0, 22817.0], [249.0, 22354.0], [248.0, 23359.0], [270.0, 22097.0], [268.0, 11525.0], [271.0, 11812.5], [269.0, 22657.0], [267.0, 22680.0], [266.0, 22167.0], [265.0, 22312.0], [264.0, 22057.0], [263.0, 22038.0], [257.0, 22243.0], [256.0, 21989.0], [259.0, 22652.0], [258.0, 22019.0], [262.0, 22687.0], [261.0, 22170.0], [260.0, 22275.0], [287.0, 22409.0], [278.0, 11729.0], [277.0, 12069.5], [276.0, 22425.0], [282.0, 12089.5], [285.0, 11651.0], [286.0, 22542.0], [284.0, 22369.0], [279.0, 21915.0], [272.0, 22431.0], [274.0, 23341.0], [273.0, 22417.0], [275.0, 22194.0], [283.0, 22517.0], [281.0, 22367.0], [280.0, 21944.0], [302.0, 23248.0], [289.0, 11842.0], [288.0, 22938.0], [291.0, 21897.0], [290.0, 22793.0], [303.0, 21882.0], [301.0, 22276.0], [300.0, 22065.0], [299.0, 22201.0], [297.0, 22967.0], [296.0, 22239.0], [295.0, 22192.0], [294.0, 22448.0], [293.0, 22221.0], [292.0, 22476.0], [318.0, 23009.0], [308.0, 11493.5], [310.0, 22026.0], [309.0, 22046.0], [311.0, 11750.0], [319.0, 21989.0], [317.0, 22388.0], [316.0, 23059.0], [307.0, 22937.0], [306.0, 21934.0], [305.0, 22277.0], [304.0, 21961.0], [315.0, 21950.0], [314.0, 22158.0], [313.0, 23047.0], [312.0, 22204.0], [334.0, 21906.0], [327.0, 11945.0], [321.0, 21708.0], [320.0, 22476.0], [323.0, 22258.0], [322.0, 22085.0], [330.0, 11764.0], [333.0, 22465.0], [332.0, 22524.0], [331.0, 21719.0], [329.0, 22539.0], [328.0, 22193.0], [326.0, 21680.0], [325.0, 21649.0], [324.0, 22721.0], [351.0, 22168.0], [344.0, 11729.0], [350.0, 22194.0], [349.0, 22378.0], [348.0, 21528.0], [339.0, 22474.0], [338.0, 22176.0], [337.0, 22370.0], [336.0, 22724.0], [347.0, 21857.0], [346.0, 22710.0], [345.0, 21910.0], [343.0, 22356.0], [342.0, 21595.0], [341.0, 22227.0], [340.0, 22213.0], [367.0, 21974.0], [354.0, 12007.5], [359.0, 21551.0], [353.0, 22365.0], [352.0, 22318.0], [358.0, 22216.0], [357.0, 22168.0], [356.0, 22800.0], [360.0, 11867.5], [366.0, 22273.0], [365.0, 22457.0], [364.0, 22204.0], [355.0, 21407.0], [363.0, 21508.0], [362.0, 21533.0], [361.0, 22437.0], [382.0, 22544.0], [371.0, 8374.333333333332], [370.0, 21991.0], [369.0, 22263.0], [368.0, 21664.0], [383.0, 21796.0], [381.0, 21980.0], [380.0, 22111.0], [379.0, 22747.0], [378.0, 22388.5], [376.0, 22441.0], [375.0, 21437.0], [374.0, 22835.0], [373.0, 22511.0], [372.0, 21952.0], [399.0, 22293.0], [386.0, 8339.0], [391.0, 22089.0], [385.0, 21905.0], [384.0, 21218.0], [390.0, 22092.0], [389.0, 22098.0], [388.0, 22104.0], [393.0, 11545.0], [398.0, 21912.0], [397.0, 22046.0], [396.0, 22064.0], [387.0, 22284.0], [395.0, 21468.0], [394.0, 21206.0], [392.0, 22090.0], [415.0, 21542.0], [408.0, 11802.5], [413.0, 11906.5], [414.0, 22381.0], [412.0, 21937.0], [403.0, 21223.0], [402.0, 21107.0], [401.0, 22668.0], [411.0, 22755.0], [410.0, 21852.0], [409.0, 21802.0], [407.0, 21158.0], [406.0, 21872.0], [405.0, 22249.0], [404.0, 22018.0], [431.0, 21703.0], [417.0, 11852.0], [423.0, 22389.0], [416.0, 21926.0], [422.0, 21700.0], [421.0, 22329.0], [420.0, 22887.0], [426.0, 11689.0], [430.0, 22022.0], [429.0, 22614.0], [428.0, 21592.0], [419.0, 23123.0], [418.0, 21914.0], [427.0, 22828.0], [425.0, 22031.0], [424.0, 21638.0], [446.0, 23805.0], [436.0, 11156.5], [438.0, 21300.0], [437.0, 21116.0], [439.0, 11680.0], [447.0, 22154.0], [445.0, 21725.0], [444.0, 20794.0], [435.0, 22747.0], [434.0, 20827.0], [433.0, 21777.0], [432.0, 20839.0], [443.0, 22430.0], [442.0, 21669.0], [441.0, 23002.0], [440.0, 21655.0], [462.0, 22356.0], [463.0, 21761.0], [461.0, 21920.0], [460.0, 21604.0], [459.0, 22092.5], [457.0, 22010.0], [456.0, 22833.0], [455.0, 22018.0], [449.0, 22048.0], [448.0, 22871.0], [451.0, 21918.0], [450.0, 21674.0], [454.0, 21663.0], [453.0, 22321.0], [452.0, 21843.0], [478.0, 21937.0], [479.0, 21465.0], [477.0, 21642.0], [476.0, 21828.0], [475.0, 21800.0], [474.0, 21224.0], [473.0, 21698.0], [472.0, 21729.0], [471.0, 21936.0], [465.0, 21892.0], [464.0, 22022.0], [467.0, 21563.0], [466.0, 21563.0], [470.0, 22118.0], [469.0, 22563.0], [468.0, 21693.0], [494.0, 21719.0], [495.0, 21881.0], [493.0, 21388.0], [492.0, 21086.0], [491.0, 21485.0], [490.0, 21230.0], [489.0, 21260.5], [487.0, 21446.0], [480.0, 21677.0], [483.0, 22590.0], [482.0, 22081.0], [486.0, 21792.0], [485.0, 21292.0], [484.0, 21335.0], [510.0, 22211.0], [511.0, 21190.0], [509.0, 21248.0], [508.0, 21122.0], [507.0, 21526.0], [506.0, 21356.0], [505.0, 21134.0], [504.0, 22192.0], [503.0, 21542.0], [497.0, 21984.0], [496.0, 21508.0], [499.0, 21157.0], [498.0, 23320.0], [502.0, 22231.0], [501.0, 21601.0], [500.0, 21280.0], [540.0, 20939.0], [542.0, 21968.0], [538.0, 21316.0], [536.0, 21011.0], [534.0, 21983.0], [532.0, 21150.0], [530.0, 21929.0], [528.0, 21860.0], [526.0, 21472.0], [514.0, 22076.0], [512.0, 21964.0], [518.0, 21443.0], [516.0, 21047.0], [524.0, 20890.0], [522.0, 21255.0], [520.0, 21341.0], [572.0, 20719.0], [574.0, 22103.0], [570.0, 21204.0], [568.0, 21642.0], [566.0, 20941.0], [564.0, 22255.0], [562.0, 21180.0], [560.0, 20929.0], [558.0, 21671.0], [546.0, 22023.0], [544.0, 20896.0], [550.0, 22110.0], [548.0, 22596.0], [556.0, 20577.0], [552.0, 21087.0], [604.0, 20313.0], [606.0, 21517.0], [602.0, 20715.0], [600.0, 21279.0], [598.0, 20957.0], [596.0, 21200.0], [594.0, 21466.0], [592.0, 21538.0], [590.0, 20764.0], [578.0, 21129.0], [576.0, 21487.0], [582.0, 20598.0], [580.0, 21070.0], [588.0, 21144.0], [586.0, 20832.0], [584.0, 22130.0], [636.0, 21054.0], [638.0, 21032.0], [634.0, 20913.0], [632.0, 20750.0], [630.0, 21310.0], [628.0, 20959.0], [626.0, 20561.0], [624.0, 21598.0], [622.0, 21153.0], [610.0, 20830.0], [608.0, 21666.0], [614.0, 20841.0], [612.0, 21273.0], [620.0, 20506.0], [618.0, 21105.0], [616.0, 20626.0], [668.0, 20994.0], [670.0, 20771.0], [666.0, 19842.0], [664.0, 20482.0], [662.0, 19550.0], [660.0, 19686.0], [658.0, 20607.0], [656.0, 19450.0], [654.0, 20180.0], [642.0, 20872.0], [640.0, 20921.0], [646.0, 20352.0], [644.0, 20420.0], [652.0, 20774.0], [650.0, 21107.0], [648.0, 20765.0], [700.0, 10797.5], [694.0, 8127.0], [696.0, 7962.333333333333], [702.0, 19453.0], [698.0, 20070.0], [692.0, 19605.0], [690.0, 19993.0], [688.0, 20805.0], [686.0, 20855.0], [674.0, 19589.0], [672.0, 20005.0], [678.0, 20846.0], [676.0, 20367.0], [684.0, 20180.0], [682.0, 20135.0], [680.0, 20781.0], [734.0, 18816.0], [722.0, 10644.5], [728.0, 8012.0], [710.0, 19733.0], [708.0, 19638.0], [706.0, 19185.0], [704.0, 19099.0], [732.0, 20456.0], [730.0, 18877.0], [726.0, 20547.0], [724.0, 19246.0], [720.0, 19349.0], [718.0, 19114.0], [716.0, 19202.0], [714.0, 19465.0], [712.0, 19491.0], [766.0, 19710.0], [756.0, 10555.0], [764.0, 18545.0], [762.0, 18574.0], [760.0, 19535.0], [740.0, 19326.0], [738.0, 20154.0], [736.0, 19378.5], [758.0, 19868.0], [754.0, 18783.5], [752.0, 18755.0], [750.0, 19738.0], [748.0, 19121.0], [746.0, 20384.0], [744.0, 18965.0], [798.0, 10520.0], [772.0, 10471.5], [782.0, 18267.0], [770.0, 18733.0], [768.0, 18550.0], [780.0, 18653.0], [778.0, 19407.0], [776.0, 18620.0], [794.0, 8265.666666666668], [796.0, 19587.0], [792.0, 18868.0], [774.0, 18592.0], [790.0, 19555.0], [788.0, 18574.0], [786.0, 18258.0], [784.0, 19187.0], [828.0, 18859.0], [830.0, 18033.0], [826.0, 18175.0], [824.0, 19218.0], [822.0, 19214.0], [820.0, 18469.0], [818.0, 18875.0], [816.0, 18175.0], [814.0, 19581.0], [802.0, 18217.0], [800.0, 18175.0], [806.0, 18876.0], [804.0, 19356.0], [812.0, 18311.0], [810.0, 18110.0], [808.0, 18580.0], [860.0, 17988.0], [838.0, 10403.5], [836.0, 18756.0], [832.0, 18223.0], [846.0, 18224.0], [844.0, 19030.0], [842.0, 18324.0], [840.0, 17890.0], [862.0, 10295.0], [858.0, 18312.0], [856.0, 17632.0], [854.0, 18161.0], [852.0, 19176.0], [850.0, 18589.0], [848.0, 17940.0], [894.0, 17710.0], [880.0, 10800.0], [888.0, 7816.333333333333], [870.0, 18420.0], [868.0, 19201.0], [866.0, 17797.0], [864.0, 18271.0], [892.0, 18792.0], [890.0, 18278.0], [886.0, 18925.0], [884.0, 18204.0], [882.0, 18112.0], [876.0, 18314.0], [874.0, 18115.0], [872.0, 19144.0], [926.0, 17710.0], [920.0, 18269.0], [902.0, 17534.0], [900.0, 18235.0], [896.0, 17777.0], [918.0, 17891.0], [924.0, 17438.0], [922.0, 17209.0], [916.0, 17882.0], [914.0, 18102.5], [912.0, 17820.0], [910.0, 18632.0], [908.0, 18582.0], [906.0, 17864.0], [904.0, 18249.0], [952.0, 18406.0], [954.0, 16974.0], [942.0, 10756.0], [940.0, 6632.75], [938.0, 17993.0], [936.0, 8000.666666666667], [934.0, 10343.0], [956.0, 18464.0], [944.0, 17088.0], [958.0, 17599.0], [950.0, 10445.5], [948.0, 17659.0], [946.0, 17693.0], [932.0, 8153.0], [928.0, 17457.0], [930.0, 17982.0], [988.0, 17460.0], [976.0, 17156.0], [978.0, 18129.0], [980.0, 17467.0], [990.0, 17484.0], [986.0, 17316.0], [984.0, 17736.0], [960.0, 17660.0], [962.0, 17761.0], [964.0, 17219.0], [966.0, 17347.0], [974.0, 17691.0], [972.0, 17664.0], [970.0, 17667.0], [982.0, 17017.0], [994.0, 17615.0], [996.0, 10030.5], [992.0, 17804.0], [1006.0, 17233.0], [1004.0, 17771.0], [1002.0, 16883.0], [1000.0, 17395.0], [1008.0, 17062.0], [1010.0, 17605.0], [1012.0, 17744.0], [1014.0, 17185.0], [1022.0, 16938.5], [1020.0, 16988.0], [1018.0, 17258.0], [1016.0, 17270.0], [998.0, 16864.0], [1080.0, 18230.0], [1056.0, 16905.0], [1060.0, 16712.0], [1064.0, 17455.0], [1084.0, 16947.0], [1076.0, 16511.0], [1072.0, 17148.0], [1024.0, 18131.0], [1028.0, 17849.0], [1032.0, 17060.0], [1036.0, 16580.5], [1052.0, 17156.0], [1048.0, 17717.0], [1044.0, 19289.0], [1040.0, 16748.0], [1068.0, 17047.0], [1140.0, 16136.0], [1144.0, 16768.0], [1148.0, 9622.5], [1120.0, 16102.0], [1124.0, 16852.0], [1128.0, 15887.0], [1136.0, 16653.0], [1088.0, 18715.0], [1092.0, 17228.0], [1096.0, 17202.0], [1100.0, 16689.0], [1116.0, 17135.0], [1108.0, 17744.0], [1104.0, 17069.0], [1132.0, 15856.0], [1156.0, 9904.0], [1164.0, 16365.0], [1160.0, 16490.0], [1200.0, 15828.0], [1204.0, 17102.0], [1152.0, 16092.0], [1180.0, 16244.0], [1176.0, 16690.0], [1172.0, 15764.0], [1168.0, 16246.0], [1192.0, 9973.0], [1188.0, 16420.0], [1184.0, 15985.0], [1196.0, 17555.0], [1208.0, 10039.5], [1212.0, 16844.0], [1220.0, 9985.5], [1224.0, 9609.0], [1216.0, 16091.0], [1244.0, 10072.0], [1240.0, 16110.0], [1236.0, 15650.0], [1232.0, 15411.0], [1264.0, 7610.666666666666], [1228.0, 15916.0], [1268.0, 16403.0], [1256.0, 10194.25], [1248.0, 15966.0], [1252.0, 16453.0], [1276.0, 15426.0], [1272.0, 16606.0], [1260.0, 15790.0], [1284.0, 15592.0], [1336.0, 14572.0], [1280.0, 14705.0], [1288.0, 15516.0], [1308.0, 15205.0], [1300.0, 16175.0], [1296.0, 14850.0], [1292.0, 9896.0], [1312.0, 14897.0], [1316.0, 16143.0], [1320.0, 15122.0], [1324.0, 14962.0], [1340.0, 14875.0], [1332.0, 14749.0], [1328.0, 14915.0], [1348.0, 15512.0], [1344.0, 7361.333333333334], [1352.0, 15549.0], [1372.0, 14312.0], [1368.0, 14845.0], [1364.0, 14305.0], [1360.0, 14528.0], [1356.0, 8929.5], [1392.0, 6856.5], [1396.0, 14680.0], [1400.0, 8945.0], [1376.0, 9574.5], [1404.0, 13945.0], [1384.0, 15553.0], [1380.0, 15290.0], [1388.0, 7332.333333333334], [1412.0, 14152.0], [1416.0, 15028.0], [1408.0, 15008.0], [1420.0, 13872.0], [1432.0, 13511.0], [1428.0, 13540.0], [1424.0, 14129.0], [1460.0, 6154.6], [1456.0, 13507.0], [1452.0, 14569.0], [1448.0, 13801.0], [1444.0, 14389.0], [1440.0, 14805.0], [1468.0, 14086.0], [1464.0, 13490.0], [1476.0, 13571.0], [1484.0, 8956.5], [1472.0, 13659.0], [1480.0, 13629.0], [1520.0, 13024.0], [1524.0, 13037.0], [1492.0, 8483.0], [1496.0, 13256.0], [1500.0, 8605.5], [1504.0, 12919.0], [1532.0, 13126.0], [1528.0, 12809.0], [1508.0, 9163.0], [1512.0, 8587.0], [1516.0, 13089.0], [1488.0, 8920.0], [1548.0, 7487.0], [1588.0, 12454.0], [1596.0, 8545.0], [1584.0, 14703.0], [1592.0, 11980.0], [1552.0, 12453.0], [1556.0, 15914.0], [1560.0, 13402.0], [1564.0, 8846.0], [1536.0, 13611.0], [1540.0, 13800.0], [1544.0, 12701.0], [1568.0, 12598.0], [1572.0, 12568.0], [1576.0, 13335.0], [1580.0, 8417.5], [1604.0, 6174.833333333334], [1600.0, 8422.5], [1628.0, 12440.0], [1620.0, 6417.4], [1624.0, 6574.5], [1616.0, 6919.0], [1608.0, 12588.0], [1648.0, 9425.5], [1652.0, 8583.5], [1636.0, 13233.0], [1632.0, 12419.0], [1660.0, 12109.0], [1656.0, 12287.0], [1640.0, 7123.0], [1644.0, 8307.333333333334], [1612.0, 9813.5], [1668.0, 12757.0], [1720.0, 8806.0], [1664.0, 13430.5], [1692.0, 7176.333333333334], [1688.0, 8515.0], [1680.0, 8795.0], [1684.0, 11365.0], [1672.0, 12195.0], [1676.0, 7988.666666666666], [1712.0, 8613.0], [1716.0, 12132.0], [1724.0, 12531.0], [1708.0, 9116.0], [1704.0, 13844.0], [1700.0, 12659.0], [1696.0, 12710.0], [1728.0, 11789.0], [1780.0, 8788.5], [1756.0, 8484.0], [1752.0, 7681.666666666666], [1748.0, 11330.0], [1744.0, 12257.0], [1732.0, 12127.0], [1736.0, 6047.166666666667], [1772.0, 8800.5], [1768.0, 13901.5], [1764.0, 14163.0], [1760.0, 9395.5], [1788.0, 12968.0], [1784.0, 11696.0], [1776.0, 8994.0], [1740.0, 13486.0], [1796.0, 7273.0], [1800.0, 8110.5], [1792.0, 13785.0], [1820.0, 12501.0], [1812.0, 7736.666666666667], [1816.0, 8850.5], [1840.0, 8599.75], [1804.0, 11382.0], [1848.0, 6476.285714285715], [1844.0, 11111.0], [1824.0, 11702.0], [1828.0, 10755.0], [1852.0, 13161.0], [1836.0, 8704.0], [1832.0, 11576.0], [1808.0, 9078.5], [1860.0, 12198.0], [1864.0, 8270.0], [1868.0, 10566.0], [1904.0, 10275.0], [1880.0, 11245.0], [1876.0, 10429.0], [1872.0, 10386.0], [1856.0, 11348.0], [1884.0, 11356.0], [1896.0, 7391.666666666666], [1900.0, 10242.0], [1888.0, 11880.0], [1892.0, 10299.0], [1916.0, 10083.0], [1912.0, 11073.0], [1908.0, 11692.0], [1932.0, 11818.0], [1924.0, 7902.0], [1920.0, 10029.0], [1928.0, 10004.0], [1968.0, 9481.0], [1976.0, 10389.0], [1972.0, 11106.0], [1980.0, 7583.0], [1956.0, 9685.0], [1952.0, 9703.0], [1960.0, 10422.0], [1964.0, 9539.0], [1936.0, 8333.5], [1940.0, 9851.0], [1944.0, 10453.0], [1948.0, 11507.0], [1984.0, 9377.0], [1988.0, 10858.0], [2008.0, 10830.0], [2012.0, 8028.5], [2004.0, 9141.0], [1992.0, 9271.0], [1996.0, 9169.0], [2000.0, 7726.0], [2016.0, 8041.0], [2020.0, 9811.0], [2024.0, 8890.0], [2028.0, 8956.0], [2044.0, 7008.0], [2036.0, 7569.333333333333], [2040.0, 8358.0], [2032.0, 10483.0], [2056.0, 8615.0], [2048.0, 8664.0], [2064.0, 8540.0], [2072.0, 8520.0], [2080.0, 7624.5], [2096.0, 8203.0], [2104.0, 9402.0], [2112.0, 7212.5], [2168.0, 8863.0], [2160.0, 7747.0], [2152.0, 7758.0], [2144.0, 7927.0], [2120.0, 9068.0], [2128.0, 8734.0], [2136.0, 7934.0], [2288.0, 7504.0], [2280.0, 7956.0], [2296.0, 7791.0], [2240.0, 7182.0], [2248.0, 7136.0], [2256.0, 8824.0], [2264.0, 8948.0], [2272.0, 8403.0], [2184.0, 7623.0], [2192.0, 7526.0], [2200.0, 7529.0], [2232.0, 8710.0], [2224.0, 7361.0], [2216.0, 7315.0], [2208.0, 8465.0], [2416.0, 6912.833333333333], [2408.0, 6610.0], [2384.0, 6749.0], [2392.0, 7868.0], [2368.0, 7849.0], [2376.0, 7042.0], [2400.0, 6736.0], [2304.0, 7656.0], [2312.0, 8143.0], [2320.0, 8349.0], [2328.0, 7307.5], [2352.0, 7012.0], [2344.0, 8130.0], [2336.0, 8226.0], [2065.0, 8537.0], [2049.0, 7681.0], [2089.0, 8266.0], [2105.0, 6876.5], [2073.0, 8521.0], [2057.0, 9397.0], [2081.0, 7140.5], [2113.0, 9549.0], [2169.0, 8750.0], [2161.0, 9296.0], [2153.0, 7793.0], [2145.0, 7879.0], [2121.0, 7511.0], [2137.0, 8852.0], [2129.0, 8667.0], [2289.0, 7506.0], [2297.0, 6717.0], [2241.0, 8404.0], [2249.0, 8071.0], [2257.0, 7665.0], [2265.0, 8551.0], [2281.0, 6771.0], [2273.0, 7598.0], [2201.0, 9322.0], [2193.0, 7587.0], [2185.0, 9410.0], [2177.0, 8605.0], [2233.0, 8970.0], [2225.0, 8034.0], [2217.0, 8057.0], [2209.0, 8342.0], [2417.0, 7198.666666666667], [2377.0, 5808.0], [2369.0, 5903.0], [2385.0, 7171.0], [2393.0, 7327.0], [2409.0, 6260.0], [2401.0, 7791.0], [2329.0, 8119.0], [2321.0, 7337.0], [2313.0, 6498.0], [2305.0, 7272.0], [2361.0, 7214.5], [2353.0, 7955.0], [2345.0, 8079.0], [2337.0, 7959.0], [1081.0, 16792.0], [1057.0, 17448.0], [1061.0, 16935.0], [1065.0, 16969.0], [1085.0, 16678.0], [1077.0, 17518.0], [1073.0, 16822.0], [1025.0, 17026.0], [1029.0, 19186.0], [1037.0, 16853.0], [1033.0, 17410.0], [1053.0, 16546.0], [1049.0, 17035.0], [1045.0, 16966.0], [1041.0, 17627.0], [1069.0, 16496.0], [1141.0, 10609.5], [1137.0, 17394.0], [1149.0, 16565.0], [1121.0, 18500.0], [1125.0, 15890.0], [1129.0, 15945.0], [1145.0, 17333.0], [1089.0, 16807.0], [1093.0, 17088.0], [1097.0, 17407.0], [1101.0, 17279.0], [1117.0, 16832.0], [1113.0, 16322.0], [1109.0, 16300.0], [1105.0, 18128.0], [1133.0, 18009.0], [1153.0, 16783.0], [1201.0, 9715.0], [1165.0, 9948.5], [1173.0, 9951.5], [1169.0, 16043.0], [1177.0, 16457.0], [1157.0, 16518.0], [1161.0, 16547.0], [1181.0, 17934.0], [1209.0, 9312.5], [1205.0, 9981.5], [1185.0, 16896.0], [1189.0, 16406.0], [1193.0, 16326.0], [1197.0, 17103.0], [1213.0, 16430.0], [1277.0, 15567.0], [1237.0, 10272.0], [1233.0, 17313.0], [1249.0, 10324.0], [1253.0, 16823.0], [1257.0, 15721.0], [1261.0, 17212.0], [1273.0, 16179.0], [1269.0, 14899.0], [1265.0, 15073.0], [1229.0, 16884.0], [1225.0, 16853.0], [1221.0, 16893.0], [1217.0, 16953.0], [1245.0, 17330.0], [1241.0, 16607.0], [1313.0, 15855.0], [1325.0, 9456.0], [1321.0, 15818.0], [1317.0, 15553.0], [1333.0, 9191.5], [1341.0, 14878.0], [1337.0, 15761.0], [1329.0, 14674.0], [1281.0, 16518.0], [1285.0, 16405.0], [1289.0, 14776.0], [1293.0, 16207.0], [1309.0, 14919.0], [1305.0, 15429.0], [1301.0, 15031.0], [1297.0, 15323.0], [1357.0, 9713.0], [1349.0, 9650.0], [1345.0, 9386.0], [1353.0, 14585.0], [1397.0, 7723.0], [1401.0, 14302.0], [1377.0, 15008.0], [1405.0, 14500.0], [1393.0, 7620.666666666666], [1373.0, 9760.0], [1369.0, 14647.0], [1365.0, 15187.0], [1361.0, 14406.0], [1381.0, 14402.0], [1385.0, 14169.0], [1389.0, 8649.5], [1413.0, 9469.5], [1465.0, 6733.666666666666], [1409.0, 14121.0], [1457.0, 14548.0], [1421.0, 14577.0], [1417.0, 13979.0], [1461.0, 7355.666666666666], [1429.0, 14166.0], [1433.0, 14587.0], [1437.0, 9190.25], [1441.0, 14803.0], [1445.0, 14622.0], [1449.0, 14719.0], [1469.0, 13744.0], [1453.0, 3884.0], [1477.0, 8559.5], [1481.0, 8386.5], [1501.0, 8594.0], [1497.0, 13894.0], [1493.0, 13536.0], [1473.0, 14032.0], [1485.0, 8881.5], [1521.0, 13808.0], [1505.0, 8752.5], [1533.0, 12810.0], [1529.0, 13661.0], [1525.0, 13109.0], [1509.0, 14148.0], [1513.0, 13721.0], [1517.0, 13591.0], [1489.0, 8810.5], [1537.0, 12581.0], [1585.0, 8771.0], [1549.0, 13944.0], [1557.0, 8349.0], [1553.0, 13357.0], [1561.0, 12968.0], [1541.0, 13412.0], [1545.0, 13751.0], [1565.0, 12948.0], [1569.0, 8775.0], [1593.0, 12513.0], [1589.0, 12570.0], [1597.0, 13518.0], [1581.0, 12664.0], [1577.0, 13205.0], [1573.0, 13336.0], [1605.0, 6620.0], [1657.0, 14183.0], [1629.0, 8700.0], [1625.0, 6256.75], [1617.0, 8516.0], [1621.0, 11647.0], [1601.0, 13007.0], [1609.0, 12654.0], [1613.0, 4377.0], [1649.0, 11975.0], [1653.0, 12598.0], [1633.0, 6139.0], [1637.0, 12784.0], [1641.0, 12704.0], [1645.0, 12632.0], [1661.0, 12471.0], [1665.0, 12088.0], [1673.0, 5739.6], [1693.0, 8652.0], [1689.0, 8219.0], [1681.0, 14029.0], [1685.0, 14371.0], [1669.0, 8975.5], [1677.0, 12442.0], [1713.0, 12215.0], [1717.0, 11813.0], [1721.0, 12237.0], [1725.0, 8179.0], [1697.0, 8671.0], [1705.0, 11244.0], [1701.0, 11784.0], [1709.0, 12137.0], [1729.0, 9807.5], [1741.0, 7433.333333333334], [1733.0, 8640.0], [1737.0, 5128.0], [1757.0, 7498.666666666666], [1749.0, 7415.333333333334], [1745.0, 11950.0], [1753.0, 11924.0], [1761.0, 7459.333333333334], [1789.0, 12020.0], [1769.0, 14099.0], [1765.0, 13848.0], [1773.0, 11923.0], [1785.0, 9218.5], [1781.0, 8472.5], [1777.0, 7726.333333333334], [1801.0, 11800.0], [1793.0, 10913.0], [1797.0, 13495.0], [1821.0, 11625.0], [1817.0, 9641.0], [1813.0, 8658.0], [1805.0, 12693.0], [1841.0, 11320.0], [1845.0, 9100.5], [1849.0, 9420.0], [1829.0, 8231.5], [1825.0, 11637.0], [1853.0, 12557.0], [1833.0, 12528.0], [1837.0, 13213.0], [1809.0, 13688.0], [1869.0, 11426.0], [1861.0, 7273.0], [1857.0, 8272.0], [1885.0, 8305.5], [1905.0, 6397.75], [1909.0, 6375.25], [1917.0, 10152.0], [1913.0, 11101.0], [1897.0, 10317.0], [1901.0, 11125.0], [1893.0, 7211.75], [1873.0, 11585.0], [1877.0, 8953.5], [1881.0, 10419.0], [1933.0, 9786.0], [1921.0, 7386.0], [1929.0, 7263.0], [1925.0, 10928.0], [1969.0, 9496.0], [1977.0, 7674.5], [1973.0, 10114.0], [1981.0, 9405.0], [1965.0, 10175.0], [1961.0, 10581.0], [1957.0, 10232.0], [1953.0, 9609.0], [1941.0, 11510.0], [1937.0, 10753.0], [1945.0, 9845.0], [1949.0, 8153.0], [1993.0, 9251.0], [1985.0, 9245.0], [1989.0, 9967.0], [2013.0, 8891.0], [2009.0, 9800.0], [2005.0, 9166.0], [1997.0, 8907.5], [2017.0, 10437.0], [2021.0, 8992.0], [2025.0, 9522.0], [2045.0, 10270.0], [2041.0, 8089.5], [2037.0, 9888.0], [2033.0, 7216.333333333333], [2029.0, 6963.0], [2001.0, 7380.333333333333], [2058.0, 8642.0], [2050.0, 10563.0], [2066.0, 8536.0], [2074.0, 8479.0], [2106.0, 6990.333333333333], [2082.0, 6832.0], [2090.0, 8286.0], [2098.0, 8225.0], [2170.0, 7737.0], [2162.0, 9363.0], [2154.0, 8386.0], [2146.0, 8614.0], [2114.0, 8108.0], [2122.0, 8002.0], [2138.0, 8594.0], [2290.0, 8124.0], [2298.0, 8576.0], [2242.0, 8058.0], [2250.0, 7143.0], [2258.0, 7968.0], [2266.0, 7557.0], [2282.0, 7685.0], [2274.0, 8558.0], [2178.0, 9593.0], [2186.0, 8245.0], [2194.0, 7541.0], [2202.0, 8155.0], [2234.0, 8228.0], [2226.0, 7292.0], [2218.0, 8051.0], [2210.0, 7439.0], [2418.0, 7503.0], [2410.0, 7798.0], [2386.0, 6713.0], [2394.0, 7174.0], [2370.0, 6719.0], [2378.0, 6966.0], [2402.0, 6633.0], [2306.0, 8815.0], [2314.0, 8356.0], [2322.0, 7866.0], [2330.0, 7856.0], [2362.0, 7643.0], [2354.0, 7244.0], [2346.0, 7443.0], [2338.0, 7929.0], [2067.0, 8511.0], [2091.0, 7483.0], [2099.0, 8932.0], [2107.0, 8108.0], [2075.0, 7237.0], [2059.0, 8519.0], [2051.0, 8675.0], [2083.0, 10046.0], [2115.0, 8104.0], [2171.0, 7667.0], [2163.0, 7692.0], [2155.0, 7770.0], [2147.0, 9373.0], [2123.0, 8135.0], [2139.0, 8540.0], [2131.0, 8244.5], [2299.0, 8000.0], [2243.0, 8418.0], [2251.0, 8973.0], [2259.0, 8537.0], [2267.0, 7538.0], [2291.0, 7734.0], [2283.0, 7705.0], [2275.0, 8787.0], [2203.0, 9018.0], [2195.0, 9023.0], [2187.0, 7615.0], [2179.0, 9240.0], [2235.0, 7255.0], [2227.0, 7337.0], [2219.0, 8806.0], [2211.0, 7391.0], [2419.0, 6804.8], [2411.0, 6939.0], [2379.0, 6371.0], [2371.0, 7935.0], [2395.0, 6738.0], [2387.0, 7000.0], [2403.0, 7418.0], [2331.0, 8313.0], [2323.0, 8220.0], [2315.0, 8233.0], [2307.0, 7693.0], [2363.0, 6849.0], [2355.0, 7211.0], [2347.0, 6867.0], [2339.0, 7434.0], [541.0, 21152.0], [543.0, 21593.0], [539.0, 22032.0], [537.0, 20647.0], [535.0, 21536.0], [533.0, 21517.0], [531.0, 21241.0], [529.0, 21411.0], [527.0, 21235.0], [515.0, 21391.0], [513.0, 21872.0], [519.0, 21192.0], [517.0, 21012.0], [525.0, 21378.0], [523.0, 21945.0], [521.0, 21292.0], [573.0, 21808.0], [575.0, 20783.0], [571.0, 22469.0], [569.0, 21109.0], [567.0, 21639.0], [565.0, 21258.0], [563.0, 20877.0], [561.0, 21487.0], [559.0, 21282.0], [547.0, 22757.0], [545.0, 20956.0], [551.0, 21018.0], [549.0, 21134.0], [557.0, 21356.0], [555.0, 21279.0], [553.0, 21879.0], [605.0, 22064.0], [607.0, 21046.0], [603.0, 20958.0], [601.0, 20658.0], [599.0, 20946.0], [597.0, 22503.0], [595.0, 22211.0], [593.0, 21879.0], [591.0, 21531.0], [579.0, 21489.0], [577.0, 22342.0], [583.0, 21285.0], [581.0, 20375.0], [589.0, 20779.0], [587.0, 21393.0], [585.0, 21371.0], [637.0, 20467.0], [639.0, 21455.0], [635.0, 20365.0], [633.0, 20472.0], [631.0, 20465.0], [629.0, 20524.0], [627.0, 21271.0], [625.0, 20665.0], [623.0, 20909.0], [611.0, 20560.0], [615.0, 21150.0], [613.0, 21701.0], [621.0, 20316.0], [619.0, 21936.0], [617.0, 20497.0], [669.0, 20254.0], [671.0, 20241.0], [667.0, 19742.0], [665.0, 20746.0], [663.0, 21207.0], [661.0, 20403.0], [659.0, 20537.0], [657.0, 20528.0], [655.0, 21210.0], [643.0, 21598.0], [641.0, 21643.0], [647.0, 22067.0], [645.0, 20626.0], [653.0, 21198.0], [651.0, 19644.0], [649.0, 19800.0], [697.0, 10866.5], [683.0, 10857.5], [681.0, 19727.0], [693.0, 11481.0], [701.0, 6557.25], [703.0, 19074.0], [699.0, 20335.0], [695.0, 19860.0], [691.0, 20334.0], [687.0, 20421.0], [675.0, 19760.0], [673.0, 19494.0], [679.0, 19679.0], [677.0, 19586.0], [685.0, 20236.0], [731.0, 19625.0], [733.0, 19086.0], [729.0, 18848.0], [711.0, 19063.0], [709.0, 20453.0], [707.0, 19016.0], [705.0, 19114.0], [727.0, 20516.0], [725.0, 18987.0], [723.0, 19076.0], [721.0, 20100.0], [719.0, 20445.0], [717.0, 19357.0], [715.0, 20535.0], [713.0, 19105.0], [765.0, 18805.0], [767.0, 18586.0], [763.0, 19189.0], [761.0, 19253.0], [759.0, 18911.0], [757.0, 20204.0], [755.0, 18723.0], [751.0, 20306.0], [739.0, 18772.0], [737.0, 19904.0], [743.0, 19630.5], [741.0, 18846.0], [749.0, 19964.0], [747.0, 19451.0], [745.0, 19229.0], [797.0, 19200.0], [793.0, 10992.0], [799.0, 19348.0], [795.0, 18208.0], [791.0, 18299.0], [789.0, 18591.0], [787.0, 19349.0], [785.0, 18811.0], [783.0, 18444.0], [771.0, 18948.0], [769.0, 18718.0], [775.0, 19529.0], [773.0, 19065.0], [781.0, 18803.0], [779.0, 18328.0], [777.0, 19148.0], [827.0, 19300.0], [801.0, 10744.0], [805.0, 10321.5], [803.0, 19752.0], [811.0, 10723.5], [809.0, 18412.0], [815.0, 19278.0], [813.0, 19229.0], [817.0, 10557.5], [819.0, 19636.0], [831.0, 18042.0], [829.0, 18840.0], [825.0, 18838.0], [807.0, 19766.0], [823.0, 18392.0], [821.0, 18533.0], [863.0, 17590.0], [853.0, 10904.5], [861.0, 18053.0], [859.0, 19229.0], [857.0, 18929.0], [839.0, 19367.0], [837.0, 19113.0], [835.0, 18935.5], [833.0, 17827.0], [855.0, 18173.0], [851.0, 17652.0], [849.0, 18330.0], [847.0, 18966.0], [845.0, 18025.0], [843.0, 18424.0], [841.0, 18616.0], [893.0, 18803.0], [895.0, 18387.0], [891.0, 17577.0], [889.0, 17912.0], [887.0, 18594.0], [885.0, 18894.0], [883.0, 17731.0], [881.0, 18482.0], [879.0, 18166.5], [867.0, 18523.0], [865.0, 18053.0], [871.0, 18287.0], [869.0, 18277.0], [877.0, 17844.0], [875.0, 17739.0], [873.0, 19194.0], [925.0, 18180.0], [911.0, 10446.0], [897.0, 18285.0], [901.0, 18409.0], [899.0, 17874.0], [909.0, 18117.0], [907.0, 17965.0], [905.0, 17547.0], [919.0, 10427.0], [917.0, 17737.0], [927.0, 17912.0], [915.0, 18543.0], [923.0, 17957.0], [921.0, 18269.0], [935.0, 17782.0], [937.0, 8032.666666666667], [941.0, 10528.5], [939.0, 10523.0], [953.0, 17594.0], [955.0, 17595.0], [957.0, 18053.0], [959.0, 17532.0], [945.0, 10223.0], [949.0, 17632.0], [947.0, 17633.0], [951.0, 18503.0], [933.0, 10333.0], [943.0, 10260.0], [929.0, 17498.0], [931.0, 18654.0], [987.0, 16870.0], [985.0, 4953.333333333333], [991.0, 17414.0], [977.0, 17431.0], [979.0, 17857.0], [981.0, 17581.0], [989.0, 17417.0], [975.0, 17729.0], [961.0, 17929.0], [963.0, 17037.0], [965.0, 17535.0], [967.0, 17219.0], [973.0, 17672.0], [971.0, 17394.0], [969.0, 17827.5], [983.0, 17251.0], [993.0, 17630.0], [1019.0, 16278.0], [997.0, 10380.5], [995.0, 17460.0], [1007.0, 17700.0], [1005.0, 17670.0], [1003.0, 17125.0], [1001.0, 17314.0], [1023.0, 17614.0], [1009.0, 17318.0], [1011.0, 17453.0], [1013.0, 17173.0], [1015.0, 16872.0], [1017.0, 17718.0], [999.0, 17364.0], [1082.0, 16833.0], [1086.0, 17249.0], [1058.0, 19109.0], [1062.0, 17193.0], [1066.0, 17040.0], [1078.0, 16296.0], [1074.0, 17001.0], [1054.0, 16883.0], [1026.0, 18067.0], [1030.0, 16681.0], [1034.0, 17418.0], [1038.0, 16966.0], [1050.0, 17102.0], [1046.0, 16836.0], [1070.0, 17214.0], [1146.0, 16370.0], [1150.0, 16266.0], [1122.0, 16738.0], [1126.0, 17780.0], [1130.0, 16504.0], [1142.0, 17436.0], [1138.0, 15632.0], [1118.0, 16319.0], [1090.0, 16185.0], [1094.0, 16426.0], [1098.0, 16653.0], [1102.0, 18680.0], [1114.0, 16869.0], [1110.0, 16505.0], [1106.0, 16563.0], [1134.0, 17393.0], [1158.0, 10372.0], [1206.0, 17712.0], [1166.0, 8371.666666666668], [1162.0, 16520.0], [1202.0, 17016.0], [1154.0, 16419.0], [1182.0, 16711.0], [1178.0, 17615.0], [1174.0, 16926.0], [1170.0, 16079.0], [1190.0, 16143.0], [1186.0, 15637.0], [1194.0, 16831.0], [1198.0, 16774.0], [1210.0, 7727.333333333333], [1214.0, 17214.0], [1218.0, 10000.0], [1222.0, 9669.0], [1242.0, 16712.0], [1238.0, 17120.0], [1234.0, 15783.0], [1246.0, 16564.0], [1230.0, 17199.0], [1226.0, 17626.0], [1266.0, 15586.0], [1270.0, 7319.0], [1278.0, 16518.0], [1250.0, 15717.0], [1254.0, 15872.0], [1274.0, 16084.0], [1262.0, 9183.0], [1258.0, 15800.0], [1286.0, 9176.0], [1282.0, 15003.0], [1290.0, 15705.0], [1310.0, 14639.0], [1306.0, 16068.0], [1302.0, 15499.0], [1298.0, 14765.0], [1342.0, 9861.5], [1314.0, 15677.0], [1318.0, 15679.0], [1322.0, 14851.0], [1326.0, 15635.0], [1338.0, 16063.0], [1334.0, 15183.0], [1330.0, 14741.0], [1294.0, 15128.0], [1350.0, 15078.0], [1394.0, 8727.0], [1346.0, 15141.0], [1354.0, 15339.0], [1374.0, 14654.0], [1370.0, 14805.0], [1366.0, 14162.0], [1362.0, 15187.0], [1358.0, 14640.0], [1398.0, 7256.333333333334], [1406.0, 14877.0], [1402.0, 14209.0], [1378.0, 7847.333333333334], [1386.0, 7869.333333333334], [1382.0, 15080.0], [1390.0, 14396.0], [1410.0, 15157.0], [1462.0, 8637.0], [1418.0, 6710.0], [1414.0, 13937.0], [1438.0, 13415.0], [1434.0, 13822.0], [1430.0, 14893.0], [1426.0, 14340.0], [1422.0, 9141.0], [1458.0, 13381.0], [1454.0, 11241.666666666666], [1450.0, 13514.0], [1446.0, 13493.0], [1442.0, 14329.0], [1470.0, 13222.0], [1466.0, 13729.0], [1482.0, 14107.0], [1526.0, 9206.5], [1502.0, 13873.0], [1474.0, 13560.0], [1478.0, 13636.0], [1486.0, 13966.0], [1522.0, 13048.0], [1498.0, 13344.0], [1494.0, 13139.0], [1534.0, 6176.333333333334], [1530.0, 12667.0], [1506.0, 6931.666666666666], [1514.0, 12910.0], [1518.0, 13538.0], [1510.0, 8696.0], [1490.0, 14440.0], [1566.0, 12961.0], [1550.0, 8300.5], [1586.0, 12679.0], [1590.0, 12486.0], [1594.0, 12407.0], [1554.0, 8601.5], [1558.0, 12506.0], [1562.0, 14742.0], [1538.0, 13366.0], [1546.0, 12873.0], [1598.0, 9449.0], [1570.0, 13312.0], [1574.0, 13631.0], [1578.0, 7028.25], [1582.0, 7047.0], [1602.0, 12848.0], [1610.0, 8465.0], [1630.0, 7409.0], [1626.0, 7455.0], [1622.0, 12204.0], [1618.0, 7601.333333333334], [1606.0, 8894.5], [1650.0, 13879.0], [1638.0, 8425.5], [1634.0, 12463.0], [1662.0, 11804.0], [1658.0, 12453.0], [1654.0, 12103.0], [1642.0, 12466.0], [1646.0, 13132.0], [1614.0, 12386.5], [1666.0, 11661.0], [1670.0, 8550.5], [1694.0, 8856.0], [1690.0, 11491.0], [1682.0, 14581.0], [1686.0, 11981.0], [1674.0, 7496.333333333334], [1718.0, 12279.0], [1714.0, 11923.0], [1726.0, 4947.0], [1722.0, 8104.5], [1706.0, 13392.0], [1702.0, 11461.0], [1698.0, 12335.0], [1710.0, 12652.0], [1678.0, 8286.5], [1734.0, 7566.666666666666], [1730.0, 9552.5], [1758.0, 12098.0], [1750.0, 13035.0], [1746.0, 12171.0], [1754.0, 8599.0], [1762.0, 7374.0], [1774.0, 8721.5], [1770.0, 9394.0], [1766.0, 12214.0], [1790.0, 13702.0], [1786.0, 12084.0], [1782.0, 12788.0], [1742.0, 11204.0], [1738.0, 12757.0], [1778.0, 13114.0], [1802.0, 11909.0], [1794.0, 11977.0], [1798.0, 11989.0], [1822.0, 11216.0], [1818.0, 12786.0], [1814.0, 11532.0], [1806.0, 13536.0], [1842.0, 6379.6], [1846.0, 11386.0], [1850.0, 11390.0], [1854.0, 11343.0], [1826.0, 12227.0], [1830.0, 8367.0], [1834.0, 12782.0], [1838.0, 9142.5], [1810.0, 7438.666666666666], [1858.0, 12910.0], [1906.0, 6953.75], [1866.0, 12314.0], [1870.0, 10421.0], [1882.0, 8732.5], [1878.0, 12209.0], [1874.0, 10040.0], [1886.0, 10390.0], [1862.0, 8509.0], [1894.0, 7809.333333333334], [1898.0, 10260.0], [1902.0, 11128.0], [1918.0, 10088.0], [1890.0, 10732.0], [1914.0, 10036.0], [1910.0, 11881.0], [1970.0, 6720.25], [1974.0, 11048.0], [1922.0, 11916.0], [1926.0, 10848.0], [1930.0, 10909.0], [1934.0, 10692.0], [1978.0, 10979.0], [1982.0, 9382.0], [1958.0, 8537.5], [1954.0, 9683.0], [1962.0, 11503.0], [1966.0, 10182.0], [1938.0, 9940.0], [1942.0, 9870.0], [1946.0, 9795.0], [1950.0, 6923.5], [1994.0, 9138.0], [1990.0, 9196.0], [1986.0, 8353.0], [2014.0, 9798.0], [2010.0, 6356.0], [2006.0, 5540.5], [1998.0, 8199.0], [2018.0, 8984.0], [2022.0, 10384.0], [2026.0, 10073.0], [2046.0, 10465.0], [2042.0, 7260.666666666667], [2038.0, 8791.0], [2034.0, 8842.0], [2030.0, 7906.5], [2002.0, 8555.0], [2060.0, 8436.0], [2148.0, 7868.0], [2164.0, 8705.0], [2052.0, 7438.0], [2068.0, 9276.0], [2108.0, 9825.0], [2076.0, 6657.666666666667], [2084.0, 6658.666666666667], [2092.0, 9191.0], [2100.0, 8162.0], [2172.0, 9557.0], [2156.0, 7733.0], [2116.0, 8060.5], [2124.0, 8028.0], [2132.0, 9725.0], [2140.0, 8976.0], [2300.0, 7907.0], [2244.0, 7158.0], [2252.0, 8849.0], [2260.0, 8786.0], [2268.0, 7952.0], [2292.0, 6752.0], [2284.0, 8274.0], [2276.0, 7511.0], [2180.0, 7640.0], [2188.0, 8422.0], [2196.0, 7544.0], [2204.0, 8436.0], [2236.0, 8148.0], [2228.0, 8659.0], [2220.0, 8594.0], [2212.0, 8635.0], [2372.0, 7815.0], [2388.0, 6723.0], [2396.0, 6496.0], [2380.0, 6927.0], [2412.0, 6423.666666666667], [2404.0, 6317.0], [2308.0, 6562.0], [2316.0, 7107.0], [2324.0, 7864.0], [2332.0, 7391.0], [2364.0, 6855.0], [2356.0, 7254.0], [2348.0, 7331.0], [2340.0, 7144.0], [2061.0, 9330.0], [2069.0, 10455.0], [2101.0, 8189.0], [2093.0, 8275.0], [2109.0, 8117.0], [2053.0, 9267.0], [2077.0, 8481.0], [2085.0, 8353.0], [2117.0, 8052.0], [2173.0, 9471.0], [2165.0, 9277.0], [2157.0, 8540.0], [2149.0, 7810.0], [2125.0, 7109.0], [2141.0, 9851.0], [2133.0, 7912.0], [2301.0, 8295.0], [2245.0, 7826.0], [2253.0, 7902.0], [2261.0, 8115.0], [2269.0, 8335.0], [2285.0, 6768.0], [2277.0, 7603.0], [2205.0, 7502.0], [2189.0, 7563.0], [2181.0, 7619.0], [2237.0, 8332.0], [2229.0, 7340.0], [2221.0, 9153.0], [2405.0, 6464.0], [2413.0, 6309.666666666667], [2381.0, 6678.0], [2373.0, 6831.0], [2397.0, 8137.0], [2389.0, 6709.0], [2333.0, 7549.0], [2325.0, 7046.0], [2317.0, 7418.0], [2309.0, 7613.0], [2365.0, 6599.0], [2357.0, 7159.0], [2349.0, 8092.0], [2341.0, 8241.0], [1083.0, 17255.0], [1087.0, 16243.0], [1059.0, 17110.0], [1063.0, 17636.0], [1067.0, 16436.0], [1079.0, 16429.0], [1075.0, 18501.0], [1055.0, 17691.0], [1027.0, 17479.0], [1031.0, 17578.0], [1051.0, 17431.0], [1047.0, 17293.0], [1043.0, 17266.0], [1071.0, 17214.0], [1143.0, 16276.0], [1139.0, 9640.0], [1151.0, 16988.0], [1123.0, 18386.0], [1127.0, 16497.0], [1131.0, 16829.0], [1147.0, 18076.0], [1119.0, 15689.0], [1091.0, 17951.0], [1095.0, 16531.0], [1099.0, 16731.0], [1103.0, 16924.0], [1115.0, 16316.0], [1111.0, 17040.0], [1107.0, 17067.0], [1135.0, 16151.0], [1183.0, 15941.0], [1167.0, 9782.0], [1171.0, 18060.0], [1175.0, 16457.0], [1179.0, 15835.0], [1155.0, 16746.0], [1159.0, 16302.0], [1203.0, 17216.0], [1207.0, 16099.0], [1215.0, 16022.0], [1187.0, 15969.0], [1191.0, 16132.0], [1195.0, 16471.0], [1199.0, 16064.0], [1211.0, 16841.0], [1267.0, 15380.0], [1275.0, 15026.0], [1235.0, 16446.0], [1239.0, 10674.0], [1251.0, 15959.0], [1259.0, 15863.0], [1263.0, 16569.0], [1279.0, 9460.0], [1271.0, 16376.0], [1231.0, 15999.0], [1227.0, 16721.0], [1223.0, 16010.0], [1219.0, 15945.0], [1247.0, 16430.0], [1243.0, 17599.0], [1339.0, 14812.0], [1323.0, 16065.0], [1319.0, 15077.0], [1315.0, 16179.0], [1327.0, 15892.0], [1331.0, 9347.5], [1335.0, 9629.5], [1343.0, 9069.5], [1311.0, 15486.0], [1283.0, 16437.0], [1287.0, 16454.0], [1291.0, 15093.0], [1295.0, 16365.0], [1307.0, 14944.0], [1303.0, 15996.0], [1299.0, 15107.0], [1351.0, 9158.5], [1347.0, 9657.0], [1355.0, 14165.0], [1395.0, 14349.0], [1399.0, 14386.0], [1403.0, 14652.0], [1407.0, 14925.0], [1371.0, 14619.0], [1367.0, 15630.0], [1363.0, 15413.0], [1375.0, 14225.0], [1379.0, 9347.5], [1383.0, 9310.0], [1387.0, 7556.666666666666], [1391.0, 13919.0], [1411.0, 14147.0], [1459.0, 7776.0], [1439.0, 13816.0], [1423.0, 13909.0], [1419.0, 14594.0], [1415.0, 14526.0], [1463.0, 14744.0], [1427.0, 9280.0], [1431.0, 14109.0], [1435.0, 14812.0], [1443.0, 9262.5], [1447.0, 14638.0], [1451.0, 13760.0], [1471.0, 13391.0], [1467.0, 13736.0], [1455.0, 9098.5], [1483.0, 14222.0], [1479.0, 13147.0], [1475.0, 9118.0], [1499.0, 14584.0], [1495.0, 13119.0], [1503.0, 14386.0], [1487.0, 13314.0], [1523.0, 9145.0], [1535.0, 12985.0], [1531.0, 13223.0], [1527.0, 13320.0], [1511.0, 8930.0], [1515.0, 13127.0], [1519.0, 12746.0], [1507.0, 7180.666666666666], [1491.0, 8517.5], [1567.0, 6733.333333333334], [1595.0, 8663.5], [1547.0, 7083.333333333334], [1551.0, 8769.0], [1555.0, 12852.0], [1559.0, 13233.0], [1563.0, 12910.0], [1539.0, 12731.0], [1543.0, 12951.5], [1599.0, 8188.5], [1591.0, 14629.0], [1587.0, 13307.0], [1571.0, 8863.0], [1583.0, 12849.0], [1579.0, 13611.0], [1575.0, 13288.0], [1603.0, 6248.5], [1627.0, 12028.0], [1631.0, 6630.5], [1619.0, 12860.0], [1623.0, 12245.0], [1611.0, 9709.5], [1607.0, 13478.0], [1651.0, 8641.0], [1615.0, 13035.0], [1655.0, 12649.0], [1659.0, 12989.0], [1635.0, 14700.0], [1639.0, 12532.0], [1643.0, 12619.0], [1647.0, 12936.0], [1671.0, 12874.0], [1667.0, 9598.0], [1691.0, 13711.0], [1695.0, 11778.0], [1683.0, 8820.0], [1687.0, 12789.0], [1675.0, 8326.0], [1679.0, 7628.333333333334], [1715.0, 9505.5], [1719.0, 11599.0], [1723.0, 8705.0], [1727.0, 12405.0], [1707.0, 6791.0], [1703.0, 12424.0], [1699.0, 12682.0], [1711.0, 14160.0], [1759.0, 11921.0], [1747.0, 12273.0], [1751.0, 7685.333333333334], [1755.0, 12870.0], [1731.0, 8841.5], [1735.0, 6362.666666666667], [1739.0, 7060.333333333334], [1791.0, 13952.0], [1763.0, 8442.0], [1771.0, 6304.666666666667], [1775.0, 12113.0], [1783.0, 13497.0], [1787.0, 8201.333333333334], [1743.0, 12369.0], [1779.0, 12766.0], [1803.0, 6765.0], [1799.0, 9185.0], [1795.0, 8215.666666666666], [1823.0, 13516.0], [1819.0, 11402.0], [1815.0, 10837.0], [1807.0, 10636.0], [1843.0, 12281.0], [1847.0, 8042.333333333333], [1855.0, 11380.0], [1827.0, 13533.0], [1851.0, 12029.0], [1831.0, 8373.5], [1835.0, 12955.0], [1811.0, 9037.0], [1867.0, 8716.0], [1907.0, 7450.5], [1859.0, 9241.5], [1887.0, 8135.0], [1863.0, 7922.5], [1871.0, 10494.0], [1911.0, 8299.0], [1891.0, 7897.0], [1919.0, 11759.0], [1915.0, 10114.0], [1895.0, 7129.333333333333], [1899.0, 11483.0], [1903.0, 10253.0], [1875.0, 7905.5], [1883.0, 11017.0], [1879.0, 10121.0], [1975.0, 10346.0], [1979.0, 9413.0], [1931.0, 6711.25], [1923.0, 8259.5], [1951.0, 11374.0], [1927.0, 10958.0], [1935.0, 11653.0], [1971.0, 11191.0], [1983.0, 9243.0], [1967.0, 7857.0], [1963.0, 10564.0], [1959.0, 11423.0], [1955.0, 9574.0], [1943.0, 6871.5], [1939.0, 11718.0], [1947.0, 9689.0], [1995.0, 7455.0], [1999.0, 7094.0], [1991.0, 8389.0], [1987.0, 9334.0], [2015.0, 8978.0], [2011.0, 9886.0], [2007.0, 8060.0], [2019.0, 8953.0], [2023.0, 8937.0], [2027.0, 8953.0], [2043.0, 10643.0], [2047.0, 9404.0], [2039.0, 7742.666666666667], [2035.0, 7530.5], [2031.0, 10643.0], [2003.0, 8203.5], [2054.0, 9441.0], [2110.0, 7535.0], [2062.0, 8506.0], [2070.0, 10009.0], [2086.0, 8226.0], [2094.0, 8295.0], [2102.0, 8019.0], [2174.0, 9403.0], [2166.0, 8564.0], [2158.0, 8515.0], [2150.0, 9486.0], [2078.0, 8284.0], [2118.0, 8054.0], [2126.0, 8826.0], [2134.0, 9020.0], [2142.0, 9037.0], [2294.0, 7510.5], [2302.0, 8363.0], [2246.0, 8356.0], [2254.0, 7114.0], [2262.0, 7751.0], [2270.0, 7663.0], [2286.0, 8602.0], [2278.0, 8384.0], [2238.0, 7179.0], [2182.0, 9239.0], [2190.0, 8668.0], [2198.0, 8048.0], [2206.0, 7477.0], [2230.0, 8069.0], [2222.0, 8839.0], [2214.0, 8278.5], [2374.0, 7121.0], [2382.0, 6967.5], [2390.0, 7458.0], [2398.0, 6486.0], [2414.0, 6959.25], [2406.0, 6588.0], [2366.0, 7216.0], [2310.0, 7346.0], [2318.0, 7666.0], [2326.0, 7582.0], [2334.0, 8195.0], [2358.0, 7181.0], [2350.0, 6804.0], [2342.0, 7116.0], [2063.0, 10151.0], [2071.0, 8492.0], [2151.0, 7810.0], [2167.0, 8701.0], [2103.0, 8167.0], [2095.0, 10220.0], [2111.0, 9719.0], [2055.0, 10095.0], [2087.0, 8337.0], [2079.0, 5590.0], [2119.0, 7604.0], [2175.0, 8664.0], [2159.0, 9223.0], [2143.0, 9455.0], [2135.0, 9165.0], [2127.0, 9114.0], [2295.0, 8260.0], [2279.0, 8614.0], [2303.0, 6667.0], [2247.0, 7135.0], [2255.0, 8296.0], [2263.0, 8009.0], [2271.0, 7981.0], [2287.0, 6794.0], [2207.0, 7436.0], [2199.0, 8955.0], [2191.0, 8375.0], [2183.0, 9156.0], [2239.0, 7219.0], [2231.0, 7297.0], [2223.0, 7328.0], [2215.0, 9046.0], [2415.0, 6518.0], [2375.0, 7668.0], [2383.0, 7571.0], [2391.0, 6628.0], [2399.0, 6738.0], [2407.0, 6566.0], [2335.0, 8068.0], [2319.0, 7342.0], [2311.0, 7359.0], [2367.0, 7795.0], [2359.0, 7201.0], [2351.0, 8251.0], [2343.0, 8039.0], [1.0, 23745.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1272.3460000000027, 13677.049333333343]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2419.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 3487.5, "minX": 1.54960824E12, "maxY": 17132.8, "series": [{"data": [[1.54960824E12, 3914.9166666666665], [1.5496083E12, 17132.8]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960824E12, 3487.5], [1.5496083E12, 15262.5]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496083E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 4380.5358422939025, "minX": 1.54960824E12, "maxY": 15801.31408681409, "series": [{"data": [[1.54960824E12, 4380.5358422939025], [1.5496083E12, 15801.31408681409]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496083E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 4380.514336917562, "minX": 1.54960824E12, "maxY": 15801.31081081079, "series": [{"data": [[1.54960824E12, 4380.514336917562], [1.5496083E12, 15801.31081081079]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496083E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 6.313620071684593, "minX": 1.54960824E12, "maxY": 163.81408681408664, "series": [{"data": [[1.54960824E12, 6.313620071684593], [1.5496083E12, 163.81408681408664]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496083E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 545.0, "minX": 1.54960824E12, "maxY": 24186.0, "series": [{"data": [[1.54960824E12, 7277.0], [1.5496083E12, 24186.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960824E12, 545.0], [1.5496083E12, 5808.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960824E12, 6027.900000000001], [1.5496083E12, 22429.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960824E12, 6990.5599999999995], [1.5496083E12, 23624.989999999998]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960824E12, 6343.0], [1.5496083E12, 22936.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496083E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 4605.0, "minX": 9.0, "maxY": 16225.0, "series": [{"data": [[9.0, 4605.0], [40.0, 16225.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 40.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 4605.0, "minX": 9.0, "maxY": 16225.0, "series": [{"data": [[9.0, 4605.0], [40.0, 16225.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 40.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 0.7666666666666667, "minX": 1.54960824E12, "maxY": 49.233333333333334, "series": [{"data": [[1.54960824E12, 49.233333333333334], [1.5496083E12, 0.7666666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496083E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 9.3, "minX": 1.54960824E12, "maxY": 40.7, "series": [{"data": [[1.54960824E12, 9.3], [1.5496083E12, 40.7]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496083E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 9.3, "minX": 1.54960824E12, "maxY": 40.7, "series": [{"data": [[1.54960824E12, 9.3], [1.5496083E12, 40.7]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496083E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
